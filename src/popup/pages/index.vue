<template>
  <!-- <div data-theme="light"> -->
  <div class="stats grid grid-cols-2 gap-4">
    <div class="stat">
      <div class="stat-title">BTC Price</div>
      <div class="stat-value text-primary">{{ btcPrice }}</div>
    </div>

    <div class="stat">
      <div class="stat-title">ETH Price</div>
      <div class="stat-value text-secondary">{{ ethPrice }}</div>
    </div>
  </div>

  <div v-if="apiKey && apiSecret" class="text-center m-4 flex flex-col">
    <!-- <button @click="resetAuth" class="btn btn-xs w-12/12 mt-3 mx-8 btn-primary">reset api token</button> -->
    <div class="flex justify-center mb-5">
      <div class="tabs text-center">
        <a v-for="currency in currencies"
          :key="currency"
          :class="['tab', 'tab-bordered', 'text-xs', selectedCurrency == currency ? 'tab-active' : '']"
          @click="selectedCurrency = currency"
        >{{ currency.toUpperCase() }}</a>
      </div>
    </div>

    <div class="badge text-xs">持仓</div>
    <table class="table table-xs table-pin-rows">
      <thead>
        <tr>
          <th style="width:21%">Instrument</th>
          <th>Direction</th>
          <th>Size</th>
          <th>Avg Price</th>
          <th>Mark Price</th>
          <th>RPL</th>
          <th>PNL</th>
          <th>Delta</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="pos in futurePositions[selectedCurrency]" :key="pos">
          <td>{{ pos.instrument_name }}</td>
          <td>{{ pos.direction }}</td>
          <td>{{ pos.size }}</td>
          <td>{{ pos.average_price }}</td>
          <td>{{ pos.mark_price }}</td>
          <td>{{ pos.realized_profit_loss }}</td>
          <td>{{ pos.total_profit_loss }}</td>
          <td>{{ pos.delta }}</td>
        </tr>
        <tr v-for="pos in optionPositions[selectedCurrency]" :key="pos.instrument_name">
          <td>{{ pos.instrument_name }}</td>
          <td>{{ pos.direction }}</td>
          <td>{{ pos.size }}</td>
          <td>{{ pos.average_price }}</td>
          <td>{{ pos.mark_price }}</td>
          <td>{{ pos.realized_profit_loss }}</td>
          <td>{{ pos.total_profit_loss }}</td>
          <td>{{ pos.delta }}</td>
        </tr>
      </tbody>
    </table>
    <div class="divider"></div>

    <div class="badge text-xs">压力测试</div>
  </div>

  <div v-else class="text-center m-4 flex flex-col">
    <input v-model="inputApiKey" type="text" placeholder="Your READ-ONLY Deribit API Key" class="input input-bordered input-xs w-12/12 mt-1 mx-8" />
    <input v-model="inputApiSecret" type="password" placeholder="Your READ-ONLY Deribit API Secret" class="input input-bordered input-xs w-12/12 mt-2 mx-8" />
    <button @click="saveKeys" class="btn btn-xs w-12/12 mt-3 mx-8 btn-primary">Submit</button>
  </div>
<!-- </div> -->
</template>

<script>
export default {
  data() {
    return {
      apiKey: null,
      apiSecret: null,
      inputApiKey: '',
      inputApiSecret: '',
      instruments: null,
      btcPrice: null,
      ethPrice: null,
      instrumentsReqId: 1,
      authReqId: 2,
      refreshReqId: 3,
      positionsReqId: 4,
      kinds: ['option', 'future'],
      currencies: ['btc', 'eth'],
      refreshToken: null,
      optionPositions: null,
      futurePositions: null,
      selectedCurrency: 'btc',
    };
  },
  mounted() {
    chrome.storage.local.get(['apiKey', 'apiSecret'], (result) => {
      this.apiKey = result.apiKey;
      this.apiSecret = result.apiSecret;
      this.instruments = {};
      for (var i = 0; i < this.kinds.length; i++) {
        this.instruments[this.kinds[i]] = {};
        this[this.kinds[i]+'Positions'] = {};
        for (var j = 0; j < this.currencies.length; j++) {
          this.instruments[this.kinds[i]][this.currencies[j]] = new Set();
          this[this.kinds[i]+'Positions'][this.currencies[j]] = {};
        }
      }
      this.wsSetup();
    });
  },
  methods: {
    saveKeys() {
      chrome.storage.local.set({
        apiKey: this.inputApiKey,
        apiSecret: this.inputApiSecret
      }, () => {
        this.apiKey = this.inputApiKey;
        this.apiSecret = this.inputApiSecret;
        // alert('API Key and Secret saved!');
      });
    },
    resetAuth() {
      this.inputApiKey = '';
      this.inputApiSecret = '';
      this.saveKeys();
    },
    periodTask: (func, interval) => {
      func();
      setInterval(func, interval);
    },
    wsSetup() {
      // var ws = new WebSocket('wss://www.deribit.com/ws/api/v2');
      var ws = new WebSocket('wss://test.deribit.com/ws/api/v2');
      ws.onmessage = (e) => {
        var msg = JSON.parse(e.data);
        if (msg.method == 'subscription') {
          if (msg.params.channel == 'deribit_price_index.btc_usd') {
            this.btcPrice = msg.params.data.price;
          } else if (msg.params.channel == 'deribit_price_index.eth_usd') {
            this.ethPrice = msg.params.data.price;
          } else if (msg.params.channel.startsWith('book.')) {
            // console.log(msg)
          } else if (msg.params.channel.startsWith('user.portfolio.')) {
            // console.log(msg)
          } else if (msg.params.channel.startsWith('user.changes.')) {
            this.updatePositions(msg.params.data.positions);
          }
        } else if (msg.id == this.instrumentsReqId) {
          var result = msg.result;
          if (result.length > 0) {
            var currency = result[0].base_currency.toLowerCase();
            var kind = result[0].kind;
            var instrumentNames = new Set(result.map((x) => x.instrument_name));
            var newInstruments = new Set([...instrumentNames].filter(x => !this.instruments[kind][currency].has(x)));
            // this.subOrderBook(newInstruments, ws);
            this.instruments[kind][currency] = instrumentNames;
          }
        } else if (msg.id == this.authReqId) {    // auth success
          // console.log(msg);
          this.refreshToken = msg.result.refresh_token;
          setInterval(() => {
            ws.send(this.refreshMsg());
          }, 1000 * 60);
          ws.send(this.portfolioMsg(this.currencies));  // 订阅 portfolio
        } else if (msg.id == this.refreshReqId) {
          // console.log(msg);
          this.refreshToken = msg.result.refresh_token;
        } else if (msg.id == this.positionsReqId) {     // 获取 positions
          this.updatePositions(msg.result);
        }
      };
      // subscriptions and periodic tasks
      ws.onopen = () => {
        ws.send(this.heartBeatMsg());                       // heart beat
        this.periodTask(() => {                             // ping
          ws.send(this.pingMsg());
        }, 30000);
        ws.send(this.authMsg());                            // auth
        ws.send(this.subIndexPriceMsg(this.currencies));    // index price
        this.periodTask(() => {                             // instruments
          for (var i = 0; i < this.kinds.length; i++) {
            for (var j = 0; j < this.currencies.length; j++) {
              ws.send(this.getInstrumentsMsg(this.kinds[i], this.currencies[j]));
            }
          }
        }, 10000);
        this.periodTask(() => {                             // user positions
          for (var i = 0; i < this.kinds.length; i++) {
            for (var j = 0; j < this.currencies.length; j++) {
              ws.send(this.positionsMsg(this.currencies[j], this.kinds[i]));
            }
          }
        }, 1000 * 60 * 5);
        // user changes
        ws.send(this.userChangesMsg());
      };
      console.log("wsSetup done");
    },
    updatePositions: function(positions) {
      for (var i = 0; i < positions.length; i++) {
        var currency = positions[i].instrument_name.split('-')[0].toLowerCase();
        var kind = positions[i].kind;
        this[kind+'Positions'][currency][positions[i].instrument_name] = positions[i];
      }
    },
    subOrderBook: function(instrumentNames, ws) {
      var instruments = [...instrumentNames];
      if (instruments.length == 0) {
        return;
      }
      var batchSize = 100;

      for (var i = 0; i < instruments.length; i += batchSize) {
        var batch = instruments.slice(i, i + batchSize);
        ws.send(this.subOrderBookMsg(batch));
      }
    },
    buildMsg: function(method, params, id) {
      if (id === undefined) id = Date.now();
      var msg = {
        "jsonrpc" : "2.0",
        "id" : id,
        "method" : method,
        "params" : params
      };
      return JSON.stringify(msg);
    },
    pingMsg: function() {
      return this.buildMsg('public/ping');
    },
    heartBeatMsg: function() {
      return this.buildMsg('public/set_heartbeat', {interval: 30});
    },
    subIndexPriceMsg: function(currencies) {
      var channels = currencies.map((x) => `deribit_price_index.${x}_usd`);
      return this.buildMsg('public/subscribe', {channels: channels});
    },
    subOrderBookMsg: function(instrumentNames) {
      var instruments = instrumentNames.map((x) => `book.${x}.agg2`);
      return this.buildMsg('public/subscribe', {channels: instruments});
    },
    getInstrumentsMsg: function(kind, currency) {
      return this.buildMsg('public/get_instruments', {currency: currency, kind: kind}, this.instrumentsReqId);
    },
    authMsg: function() {
      return this.buildMsg('public/auth', {grant_type: 'client_credentials', client_id: this.apiKey, client_secret: this.apiSecret}, this.authReqId);
    },
    refreshMsg: function() {
      return this.buildMsg('public/auth', {grant_type: 'refresh_token', refresh_token: this.refreshToken}, this.refreshReqId);
    },
    portfolioMsg: function(currencies) {
      var channels = currencies.map((x) => `user.portfolio.${x}`);
      return this.buildMsg('private/subscribe', {channels: channels});
    },
    positionsMsg: function(currency, kind) {
      return this.buildMsg('private/get_positions', {currency: currency, kind: kind}, this.positionsReqId);
    },
    userChangesMsg: function() {
      var channels = [];
      for (var i = 0; i < this.kinds.length; i++) {
        for (var j = 0; j < this.currencies.length; j++) {
          channels.push(`user.changes.${this.kinds[i]}.${this.currencies[j].toUpperCase()}.raw`);
        }
      }
      return this.buildMsg('private/subscribe', {channels: channels});
    },
  }
}
</script>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
