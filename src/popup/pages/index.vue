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
    <div class="flex justify-center mb-5">
      <div class="tabs text-center">
        <a v-for="currency in currencies"
          :key="currency"
          :class="['tab', 'tab-bordered', 'text-xs', selectedCurrency == currency ? 'tab-active' : '']"
          @click="selectedCurrency = currency"
        >{{ currency.toUpperCase() }}</a>
      </div>
    </div>

    <div class="badge badge-neutral text-xs mb-4">账户信息</div>
    <div class="stats shadow">

      <div class="stat">
        <div class="stat-title">Equity</div>
        <div v-if="portfolios[selectedCurrency]" class="stat-value text-base">{{ portfolios[selectedCurrency].equity }}</div>
      </div>

      <div class="stat">
        <div class="stat-title">IM</div>
        <div  v-if="portfolios[selectedCurrency]" class="stat-value text-base">{{ ((portfolios[selectedCurrency].initial_margin / portfolios[selectedCurrency].equity) * 100).toFixed(2) }}%</div>
      </div>

      <div class="stat">
        <div class="stat-title">MM</div>
        <div  v-if="portfolios[selectedCurrency]" class="stat-value text-base">{{ ((portfolios[selectedCurrency].maintenance_margin / portfolios[selectedCurrency].equity) * 100).toFixed(2) }}%</div>
      </div>

    </div>
    <!-- <div class="divider"></div> -->

    <div class="badge badge-neutral text-xs mb-4 mt-8">期货持仓分布</div>
    <table class="table table-xs table-pin-rows">
      <thead>
        <tr>
          <th v-for="pos in sortedFuturePositions(selectedCurrency)" :key="pos.instrument_name">{{ pos.instrument_name.split('-')[1] }}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td v-for="pos in sortedFuturePositions(selectedCurrency)" :key="pos.instrument_name">{{ pos.size }}</td>
        </tr>
      </tbody>
    </table>

    <div class="badge badge-neutral text-xs mt-6 mb-3">期权持仓分布</div>
    <table class="table table-xs table-pin-rows text-center table-boarded">
      <thead>
        <tr class="bg-base-200">
          <th>CALL</th>
          <th>PUT</th>
        </tr>
      </thead>
    </table>
    <table class="table table-xs table-pin-rows text-center">
      <thead>
        <tr>
          <th v-for="exp in formattedOptionPositions(selectedCurrency)[0]" :key="exp">{{ exp }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in formattedOptionPositions(selectedCurrency).slice(1)" :key="row">
          <td v-for="pos in row" :key="pos">{{ pos }}</td>
        </tr>
      </tbody>
    </table>
    <!-- <div class="divider"></div> -->

    <div class="badge badge-default text-xs mb-4 mt-8">操作</div>
    <button @click="resetAuth" class="btn btn-xs w-2/12 btn-default">log out</button>

    <!-- <div class="badge text-xs badge-neutral mb-4">压力测试</div> -->
    <!-- <div v-for="pos in optionPositions[selectedCurrency]" :key="pos.instrument_name">
      <p>{{ pos.instrument_name }}</p>
      <p>{{ bsm(pos, ethPrice, ethPrice, 38) }}</p>
    </div> -->
  </div>

  <div v-else class="text-center m-4 flex flex-col">
    <input v-model="inputApiKey" type="text" placeholder="Your READ-ONLY Deribit API Key" class="input input-bordered input-xs w-12/12 mt-1 mx-8" />
    <input v-model="inputApiSecret" type="password" placeholder="Your READ-ONLY Deribit API Secret" class="input input-bordered input-xs w-12/12 mt-2 mx-8" />
    <p class="text-xs text-gray-500 text-center mt-2">为防止切换到其他标签页复制 api key 和 secret 导致本窗口被关闭，请先将保存了 api 信息的其他标签页提前打开成独立的页面再完成信息的复制。</p>
    <button @click="saveKeys" class="btn btn-xs w-12/12 mt-3 mx-8 btn-primary">Submit</button>
  </div>
<!-- </div> -->
</template>

<script>
import Greeks from './Greeks'
const deribitWs = 'wss://test.deribit.com/ws/api/v2';

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
      subscribedTickers: null,
      tickers: null,
      portfolios: null,
      // ws: null,
    };
  },
  watch: {
    'apiKey': function(newApiKey, oldApiKey) {
      if (!oldApiKey && newApiKey) {
        console.log('apiKey changed');
        this.privateWsSetup();
      }
    },
  },
  mounted() {
    chrome.storage.local.get(['apiKey', 'apiSecret'], (result) => {
      this.apiKey = result.apiKey;
      this.apiSecret = result.apiSecret;
      this.instruments = {};
      this.tickers = {};
      this.portfolios = {};
      this.subscribedTickers = new Set();
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
    bsm(pos, underlyingPrice, indexPrice, iv) {
      return new Greeks(pos, underlyingPrice, indexPrice, iv).bsmPrice() / indexPrice;
    },
    // 期货持仓分布数据
    sortedFuturePositions(currency) {
      var positions = [];
      for (const instrument in this.futurePositions[currency]) {
        positions.push(this.futurePositions[currency][instrument]);
      }
      positions.sort(function(a, b) {
        let aExp = a.instrument_name.split('-')[1];
        let bExp = b.instrument_name.split('-')[1];
        if (aExp == 'PERPETUAL') {
          return -1;
        }
        let aExpTs = new Date(aExp).getTime();
        let bExpTs = new Date(bExp).getTime();
        return aExpTs - bExpTs;
      });
      return positions;
    },
    // 期权持仓分布数据
    formattedOptionPositions(currency) {
      var expStrs = new Set(Object.keys(this.optionPositions[currency]).map((x) => x.split('-')[1]));
      if (expStrs.size == 0) {
        return [];
      }
      expStrs = [...expStrs];
      expStrs.sort((a, b) => Date.parse(a) - Date.parse(b));  // for puts

      const callExpStrs = expStrs.slice().reverse();
      const expDates = callExpStrs.concat(['Strike']).concat(expStrs);  // ['Date3', 'Date2', 'Date1', 'Strike', 'Date1', 'Date2', 'Date3']
      var strikePrices = new Set(Object.keys(this.optionPositions[currency]).map((x) => parseInt(x.split('-')[2])));
      strikePrices = [...strikePrices].sort((a, b) => a - b);
      var positionRows = [];

      for (var i = 0; i < strikePrices.length; i++) {
        var strikePrice = strikePrices[i];
        var row = [];
        // calls
        for (var j = 0; j < expStrs.length; j++) {
          var instrumentName = `${currency.toUpperCase()}-${callExpStrs[j]}-${strikePrice}-C`;
          if (this.optionPositions[currency][instrumentName]) {
            row.push(this.optionPositions[currency][instrumentName].size);
          } else {
            row.push(null);
          }
        }
        // strike price
        row.push(strikePrice);
        // puts
        for (var j = 0; j < expStrs.length; j++) {
          var instrumentName = `${currency.toUpperCase()}-${expStrs[j]}-${strikePrice}-P`;
          if (this.optionPositions[currency][instrumentName]) {
            row.push(this.optionPositions[currency][instrumentName].size);
          } else {
            row.push(null);
          }
        }
        positionRows.push(row);
      }
      return [expDates].concat(positionRows);
    },
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
      var ws = new WebSocket(deribitWs);
      ws.onmessage = (e) => {
        var msg = JSON.parse(e.data);
        if (msg.method == 'subscription') {
          if (msg.params.channel == 'deribit_price_index.btc_usd') {
            this.btcPrice = msg.params.data.price;
          } else if (msg.params.channel == 'deribit_price_index.eth_usd') {
            this.ethPrice = msg.params.data.price;
          } else if (msg.params.channel.startsWith('ticker.')) {
            var ticker = msg.params.data;
            this.tickers[ticker.instrument_name] = ticker;
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
        }
      };
      // subscriptions and periodic tasks
      ws.onopen = () => {
        ws.send(this.heartBeatMsg());                       // heart beat
        this.periodTask(() => {                             // ping
          ws.send(this.pingMsg());
        }, 30000);
        ws.send(this.subIndexPriceMsg(this.currencies));    // index price

        // this.periodTask(() => {                             // instruments
        //   for (var i = 0; i < this.kinds.length; i++) {
        //     for (var j = 0; j < this.currencies.length; j++) {
        //       ws.send(this.getInstrumentsMsg(this.kinds[i], this.currencies[j]));
        //     }
        //   }
        // }, 10000);
      };
      console.log("wsSetup done");
    },
    privateWsSetup: function() {
      var ws = new WebSocket(deribitWs);
      ws.onmessage = (e) => {
        var msg = JSON.parse(e.data);
        if (msg.method == 'subscription') {
          if (msg.params.channel.startsWith('user.portfolio.')) {
            this.portfolios[msg.params.data.currency.toLowerCase()] = msg.params.data;
          } else if (msg.params.channel.startsWith('user.changes.')) {
            this.updatePositions(msg.params.data.positions, ws);
          }
        } else if (msg.id == this.authReqId) {    // auth success
          this.refreshToken = msg.result.refresh_token;
          setInterval(() => {
            ws.send(this.refreshMsg());
          }, 1000 * 60);
          ws.send(this.portfolioMsg(this.currencies));  // 订阅 portfolio
        } else if (msg.id == this.refreshReqId) {
          this.refreshToken = msg.result.refresh_token;
        } else if (msg.id == this.positionsReqId) {     // 获取 positions
          this.updatePositions(msg.result, ws);
        }
      };
      // subscriptions and periodic tasks
      ws.onopen = () => {
        ws.send(this.heartBeatMsg());                       // heart beat
        this.periodTask(() => {                             // ping
          ws.send(this.pingMsg());
        }, 30000);
        ws.send(this.authMsg());                            // auth
        this.periodTask(() => {                             // user positions
          for (var i = 0; i < this.kinds.length; i++) {
            for (var j = 0; j < this.currencies.length; j++) {
              ws.send(this.positionsMsg(this.currencies[j], this.kinds[i]));
            }
          }
        }, 1000 * 60 * 5);

        ws.send(this.userChangesMsg());                     // user changes
      };
      console.log("privateWsSetup done");
    },
    updatePositions: function(positions, ws) {
      for (var i = 0; i < positions.length; i++) {
        var currency = positions[i].instrument_name.split('-')[0].toLowerCase();
        var kind = positions[i].kind;
        this[kind+'Positions'][currency][positions[i].instrument_name] = positions[i];
      }
      var instruments = positions.map((x) => x.instrument_name);
      var newInstruments = new Set([...instruments].filter(x => !this.subscribedTickers.has(x)));

      this.subTickers([...newInstruments], ws);
    },
    subTickers: function(instruments, ws) {
      var batchSize = 100;
      for (var i = 0; i < instruments.length; i += batchSize) {
        var batch = instruments.slice(i, i + batchSize);
        var channels = batch.map((x) => `ticker.${x}.raw`);
        ws.send(this.buildMsg('public/subscribe', {channels: channels}));
        this.subscribedTickers.add(...batch);
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
