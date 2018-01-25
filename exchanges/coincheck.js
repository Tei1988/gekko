var Coincheck = require("coincheck");
var util = require('../core/util.js');
var _ = require('lodash');
var moment = require('moment');
var log = require('../core/log');

var Trader = function(config) {
  _.bindAll(this);

  if(_.isObject(config)) {
    this.key = 'key' in config ? config.key : '';
    this.secret = 'secret' in config ? config.secret : '';
  }
  this.name = 'coincheck';
  this.balance;
  this.price;

  this.coincheck = new Coincheck.CoinCheck(this.key, this.secret);
}

// if the exchange errors we try the same call again after
// waiting 10 seconds
Trader.prototype.retry = function(method, args) {
  var wait = +moment.duration(10, 'seconds');
  log.debug(this.name, 'returned an error, retrying..');

  var self = this;

  // make sure the callback (and any other fn)
  // is bound to Trader
  _.each(args, function(arg, i) {
    if(_.isFunction(arg))
      args[i] = _.bind(arg, self);
  });

  // run the failed method again with the same
  // arguments after wait
  setTimeout(
    function() { method.apply(self, args) },
    wait
  );
}

Trader.prototype.getPortfolio = function(callback) {
  const success = function(data) {
    var portfolio = []
    _.each(
      _.omit(JSON.parse(data), function (amount, asset) {
        return asset.match(/success|_/)
      }), function(amount, asset) {
        portfolio.push({ name: asset.toUpperCase(), amount: parseFloat(amount) })
    })
    callback(null, portfolio)
  }.bind(this)

  const error = function() {
    util.die('Gekko was unable to set the portfolio');
  }.bind(this)

  this.coincheck.account.balance({ options: { success: success, error: error } })
}

Trader.prototype.getTicker = function(callback) {
  const args = _.toArray(arguments);

  const success = function(data) {
    const ticker = JSON.parse(data)
    callback(null, {
      bid: parseFloat(ticker.bid),
      ask: parseFloat(ticker.ask),
    })
  }.bind(this)

  const error = function() {
    return this.retry(this.getTicker, args);
  }.bind(this)

  this.coincheck.ticker.all({ options: { success: success, error: error } })
}

Trader.prototype.getFee = function(callback) {
    var makerFee = 0.0;
    callback(false, makerFee / 100);
}

Trader.prototype.buy = function(amount, price, callback) {
  var args = _.toArray(arguments);

  const success = function(data) {
    const order = JSON.parse(data)
    callback(null, order.id)
  }.bind(this)

  const error = function() {
    return this.retry(this.buy, args);
  }.bind(this)

  this.coincheck.order.create({
    data: { rate: price, amount: amount, order_type: 'buy', pair: 'btc_jpy'},
    options: { success: success, error: error }
  })
}

Trader.prototype.sell = function(amount, price, callback) {
  var args = _.toArray(arguments);

  const success = function(data) {
    const order = JSON.parse(data)
    callback(null, order.id)
  }.bind(this)

  const error = function() {
    return this.retry(this.sell, args);
  }.bind(this)

  this.coincheck.order.create({
    data: { rate: price, amount: amount, order_type: 'sell', pair: 'btc_jpy'},
    options: { success: success, error: error }
  })
}

Trader.prototype.checkOrder = function(order, callback) {
  const success = function(data) {
    const orders = JSON.parse(data).orders
    const stillThere = _.find(orders, function(o) { return o.id === order })
    callback(null, !stillThere)
  }.bind(this)

  const error = function() {
    callback(null)
  }.bind(this)
  this.coincheck.order.opens({ options: { success: success, error: error } })
}

Trader.prototype.cancelOrder = function(order, callback) {
  var args = _.toArray(arguments);

  const success = function(data) { callback() }.bind(this)

  const error = function() {
    return this.retry(this.cancelOrder, args);
  }.bind(this)

  this.coincheck.order.cancel({
    data: { id: order },
    options: { success: success, error: error }
  })
}

Trader.prototype.getTrades = function(since, callback, descending) {
  const args = _.toArray(arguments);
  const firstFetch = !!since;
  const success = function(data) {
    const trades = JSON.parse(data).data
    const result = _.map(trades, function(trade) {
      return {
        tid: trade.id,
        amount: parseFloat(trade.amount),
        date: moment.utc(trade.created_at).unix(),
        price: parseFloat(trade.rate),
      }
    })
    callback(null, result.reverse());
  }.bind(this)

  const error = function() {
    return this.retry(this.getTrades, args);
  }.bind(this)

  this.coincheck.trade.all({
    data: { pair: 'btc_jpy', limit: '2000' },
    options: { success: success, error: error }
  })
}

Trader.getCapabilities = function () {
  return {
    name: 'Coincheck',
    slug: 'coincheck',
    currencies: ['JPY', 'BTC'],
    assets: ['BTC'],
    markets: [
      {
        pair: ['JPY', 'BTC'], minimalOrder: { amount: 0.005, unit: 'asset' }
      }
    ],

    requires: ['key', 'secret'],
    providesHistory: 'date',
    providesFullHistory: false,
    tid: 'tid',
    tradable: true,
    forceReorderDelay: false
  }
}

module.exports = Trader;
