/*
    position:
    {
        "floating_profit_loss_usd": -576.472038,
        "average_price_usd": 656.76,
        "total_profit_loss": -0.369470928,
        "realized_profit_loss": 0,
        "floating_profit_loss": -0.000394576,
        "average_price": 0.421,
        "settlement_price": 0.051924,
        "mark_price": 0.051529,
        "instrument_name": "ETH-29DEC23-1500-P",
        "theta": -0.67199,
        "vega": 2.7563,
        "gamma": 0.00135,
        "delta": -0.3743,
        "open_orders_margin": 0,
        "initial_margin": 0,
        "maintenance_margin": 0,
        "direction": "buy",
        "index_price": 1558.11,
        "kind": "option",
        "size": 1
    }
    ticker:
    {
        "estimated_delivery_price": 1575.93,
        "best_bid_amount": 275,
        "best_ask_amount": 483,
        "best_bid_price": 0.0465,
        "best_ask_price": 0.4135,
        "interest_rate": 0,
        "open_interest": 3590,
        "settlement_price": 0.051924,
        "last_price": 0.421,
        "bid_iv": 38.36,
        "ask_iv": 257.4,
        "mark_iv": 38.53,
        "underlying_index": "ETH-29DEC23",
        "underlying_price": 1581.39,
        "min_price": 0.0001,
        "max_price": 0.5465,
        "mark_price": 0.0468,
        "instrument_name": "ETH-29DEC23-1500-P",
        "index_price": 1575.93,
        "greeks": {
            "rho": -1.3576,
            "theta": -0.66502,
            "vega": 2.72437,
            "gamma": 0.00131,
            "delta": -0.35029
        },
        "stats": {
            "volume_usd": 19542.12,
            "volume": 251,
            "price_change": 777.0833,
            "low": 0.048,
            "high": 0.421
        },
        "state": "open",
        "timestamp": 1697018763524
    }
    portfolio:
    {
        "delta_total_map": {
            "btc_usd": 10.278129865
        },
        "total_pl": -5.613779,
        "session_rpl": -0.00013228,
        "maintenance_margin": 1.87548489,
        "delta_total": 10.27813,
        "futures_session_upl": 0.082398,
        "futures_pl": -5.613779,
        "options_value": 0,
        "projected_delta_total": 10.27813,
        "options_gamma": 0,
        "cross_collateral_enabled": false,
        "options_theta": 0,
        "margin_balance": 347.42517914,
        "options_vega_map": {},
        "available_withdrawal_funds": 344.90478306,
        "futures_session_rpl": -0.00013228,
        "projected_initial_margin": 2.43813036,
        "options_session_rpl": 0,
        "available_funds": 344.98704878,
        "options_theta_map": {},
        "options_delta": 0,
        "session_upl": 0.082398,
        "initial_margin": 2.43813036,
        "balance": 347.34291342,
        "options_session_upl": 0,
        "spot_reserve": 0,
        "options_vega": 0,
        "portfolio_margining_enabled": true,
        "options_pl": 0,
        "fee_balance": 0,
        "equity": 347.42517914,
        "options_gamma_map": {},
        "projected_maintenance_margin": 1.87548489,
        "currency": "BTC"
    }
*/

export default class Greeks {
    constructor(position, indexPrice, underlyingPrice, iv) {
        this.position = position;
        this.indexPrice = indexPrice;
        this.underlyingPrice = underlyingPrice;
        this.iv = iv / 100;
        this.rf = 0

        let currency, expStr, strike, opType;
        [currency, expStr, strike, opType] = position.instrument_name.split('-');
        this.expireTs = Date.parse(expStr + ' 08:00:00 GMT+0000') / 1000;
        this.strike = parseInt(strike);
        this.opType = opType;

        this.currentTs = Date.now() / 1000;
        this.timeToExp = this.expireTs - this.currentTs;
        if (this.timeToExp < 0) {
            this.timeToExp = 0;
        }
        this.t = this.timeToExp / 86400 / 365;      // annualized T
        this.eRt = Math.exp(-this.rf * this.t);
        this.sigma_sqrt_t = this.iv * Math.sqrt(this.t);

        var numerator = Math.log(this.underlyingPrice / this.strike) + (this.rf + this.iv * this.iv / 2) * this.t;
        this.numerator = numerator;
        var dominator = this.sigma_sqrt_t;
        if (dominator != 0) {
            this.d1 = numerator / dominator;
        } else {
            this.d1 = Math.Infinity;
        }

        this.d2 = this.d1 - this.sigma_sqrt_t;
        this.nd1 = this.ncdf(this.d1, 0, 1);
        this.nd2 = this.ncdf(this.d2, 0, 1);
        this.d_nd1 = Math.exp(-this.d1 * this.d1 / 2) / Math.sqrt(2 * Math.PI);
    }

    ncdf(x, mean, std) {
        var x = (x - mean) / std
        var t = 1 / (1 + .2315419 * Math.abs(x))
        var d =.3989423 * Math.exp( -x * x / 2)
        var prob = d * t * (.3193815 + t * ( -.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
        if( x > 0 ) prob = 1 - prob
        return prob
    }

    payoff() {
        if (this.expireTs > this.currentTs) {
            return 0;
        }
        if (this.opType == 'C') {
            return Math.max(this.underlyingPrice - this.strike, 0);
        } else {
            return Math.max(this.strike - this.underlyingPrice, 0);
        }
    }

    bsmPrice() {
        if (this.expireTs <= this.currentTs) {
            return this.payoff();
        }
        if (this.opType == 'C') {
            return this.callPrice();
        } else {
            return this.putPrice();
        }
    }

    callPrice() {
        return this.underlyingPrice * this.nd1 - this.strike * this.eRt * this.nd2;
    }

    putPrice() {
        return this.strike * this.eRt * (1 - this.nd2) - this.underlyingPrice * (1 - this.nd1);
    }

    paDelta() {
        if (this.opType == 'C') {
            return this.decayFactor() * this.eRt * this.strike / this.underlyingPrice * this.nd2;
        } else {
            return this.decayFactor() * this.eRt * this.strike / this.underlyingPrice * (this.nd2 - 1);
        }
    }

    decayFactor() {
        if (this.timeToExp <= 0) {
            return 0;
        }
        if (this.timeToExp > 60 * 30) {
            return 1;
        } else {
            return this.timeToExp / (60 * 30);
        }
    }
}
