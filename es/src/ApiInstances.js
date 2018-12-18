function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// var { List } = require("immutable");
import ChainWebSocket from "./ChainWebSocket";
import GrapheneApi from "./GrapheneApi";
import ChainConfig from "./ChainConfig";

if (global) {
    global.inst = "";
} else {
    var _inst = void 0;
};
var autoReconnect = false; // by default don't use reconnecting-websocket
/**
    Configure: configure as follows `Apis.instance("ws://localhost:8090").init_promise`.  This returns a promise, once resolved the connection is ready.

    Import: import { Apis } from "@graphene/chain"

    Short-hand: Apis.db.method("parm1", 2, 3, ...).  Returns a promise with results.

    Additional usage: Apis.instance().db_api().exec("method", ["method", "parm1", 2, 3, ...]).  Returns a promise with results.
*/

var Apis = function () {
    function Apis() {
        _classCallCheck(this, Apis);
    }

    Apis.setRpcConnectionStatusCallback = function setRpcConnectionStatusCallback(callback) {
        this.statusCb = callback;
        if (inst) inst.setRpcConnectionStatusCallback(callback);
    };

    /**
        @arg {boolean} auto means automatic reconnect if possible( browser case), default true
    */


    Apis.setAutoReconnect = function setAutoReconnect(auto) {
        autoReconnect = auto;
    };

    /**
        @arg {string} cs is only provided in the first call
        @return {Apis} singleton .. Check Apis.instance().init_promise to know when the connection is established
    */


    Apis.reset = function reset() {
        var cs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : "ws://localhost:8090";
        var connect = arguments[1];
        var connectTimeout = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 4000;
        var optionalApis = arguments[3];
        var rpc_user = arguments[4];

        var _this = this;

        var rpc_password = arguments[5];
        var closeCb = arguments[6];

        return this.close().then(function () {
            inst = new Apis();
            inst.setRpcConnectionStatusCallback(_this.statusCb);

            if (inst && connect) {
                inst.connect(cs, connectTimeout, optionalApis, rpc_user, rpc_password, closeCb);
            }

            return inst;
        });
    };

    Apis.instance = function instance() {
        var cs = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : "ws://localhost:8090";
        var connect = arguments[1];
        var connectTimeout = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 4000;
        var optionalApis = arguments[3];
        var rpc_user = arguments[4];
        var rpc_password = arguments[5];
        var closeCb = arguments[6];

        if (!inst) {
            inst = new Apis();
            inst.setRpcConnectionStatusCallback(this.statusCb);
        }

        if (inst && connect) {
            inst.connect(cs, connectTimeout, optionalApis, rpc_user, rpc_password);
        }
        if (closeCb) inst.closeCb = closeCb;
        return inst;
    };

    Apis.chainId = function chainId() {
        return this.instance().chain_id;
    };

    Apis.close = function close() {
        if (inst) {
            return new Promise(function (res) {
                inst.close().then(function () {
                    inst = null;
                    res();
                });
            });
        }

        return Promise.resolve();
    };
    // db: (method, ...args) => Apis.instance().db_api().exec(method, toStrings(args)),
    // network: (method, ...args) => Apis.instance().network_api().exec(method, toStrings(args)),
    // history: (method, ...args) => Apis.instance().history_api().exec(method, toStrings(args)),
    // crypto: (method, ...args) => Apis.instance().crypto_api().exec(method, toStrings(args))
    // orders: (method, ...args) => Apis.instance().orders_api().exec(method, toStrings(args))


    /** @arg {string} connection .. */
    Apis.prototype.connect = function connect(cs, connectTimeout) {
        var optionalApis = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : { enableCrypto: false, enableOrders: false, enableAsset: false };

        var _this2 = this;

        var rpc_user = arguments[3];
        var rpc_password = arguments[4];

        // console.log("INFO\tApiInstances\tconnect\t", cs);
        this.url = cs;
        var rpc_user = rpc_user;
        var rpc_password = rpc_password;
        if (typeof window !== "undefined" && window.location && window.location.protocol === "https:" && cs.indexOf("wss://") < 0) {
            throw new Error("Secure domains require wss connection");
        }

        if (this.ws_rpc) {
            this.ws_rpc.statusCb = null;
            this.ws_rpc.keepAliveCb = null;
            this.ws_rpc.on_close = null;
            this.ws_rpc.on_reconnect = null;
        }
        this.ws_rpc = new ChainWebSocket(cs, this.statusCb, connectTimeout, autoReconnect, function (closed) {
            if (_this2._db && !closed) {
                _this2._db.exec('get_objects', [['2.1.0']]).catch(function (e) {});
            }
        });

        this.init_promise = this.ws_rpc.login(rpc_user, rpc_password).then(function () {
            //console.log("Connected to API node:", cs);
            _this2._db = new GrapheneApi(_this2.ws_rpc, "database");
            _this2._net = new GrapheneApi(_this2.ws_rpc, "network_broadcast");
            _this2._hist = new GrapheneApi(_this2.ws_rpc, "history");
            if (optionalApis.enableOrders) _this2._orders = new GrapheneApi(_this2.ws_rpc, "orders");
            if (optionalApis.enableCrypto) _this2._crypt = new GrapheneApi(_this2.ws_rpc, "crypto");
            if (optionalApis.enableAsset) _this2._asset = new GrapheneApi(_this2.ws_rpc, "asset");
            var db_promise = _this2._db.init().then(function () {
                //https://github.com/cryptonomex/graphene/wiki/chain-locked-tx
                return _this2._db.exec("get_chain_id", []).then(function (_chain_id) {
                    _this2.chain_id = _chain_id;
                    return ChainConfig.setChainId(_chain_id);
                    //DEBUG console.log("chain_id1",this.chain_id)
                });
            });
            _this2.ws_rpc.on_reconnect = function () {
                if (!_this2.ws_rpc) return;
                _this2.ws_rpc.login("", "").then(function () {
                    _this2._db.init().then(function () {
                        if (_this2.statusCb) _this2.statusCb("reconnect");
                    });
                    _this2._net.init();
                    _this2._hist.init();
                    if (optionalApis.enableOrders) _this2._orders.init();
                    if (optionalApis.enableCrypto) _this2._crypt.init();
                    if (optionalApis.enableAsset) _this2._asset.init();
                });
            };
            _this2.ws_rpc.on_close = function () {
                _this2.close().then(function () {
                    if (_this2.closeCb) _this2.closeCb();
                });
            };
            var initPromises = [db_promise, _this2._net.init(), _this2._hist.init()];

            if (optionalApis.enableOrders) initPromises.push(_this2._orders.init());
            if (optionalApis.enableCrypto) initPromises.push(_this2._crypt.init());
            if (optionalApis.enableAsset) initPromises.push(_this2._asset.init());
            return Promise.all(initPromises);
        }).catch(function (err) {
            console.error(cs, "Failed to initialize with error", err && err.message);
            return _this2.close().then(function () {
                throw err;
            });
        });
    };

    Apis.prototype.close = function close() {
        var _this3 = this;

        if (this.ws_rpc && this.ws_rpc.ws.readyState === 1) {
            return this.ws_rpc.close().then(function () {
                _this3.ws_rpc = null;
            });
        };
        this.ws_rpc = null;
        return Promise.resolve();
    };

    Apis.prototype.db_api = function db_api() {
        return this._db;
    };

    Apis.prototype.network_api = function network_api() {
        return this._net;
    };

    Apis.prototype.history_api = function history_api() {
        return this._hist;
    };

    Apis.prototype.crypto_api = function crypto_api() {
        return this._crypt;
    };

    Apis.prototype.orders_api = function orders_api() {
        return this._orders;
    };

    Apis.prototype.asset_api = function asset_api() {
        return this._asset;
    };

    Apis.prototype.setRpcConnectionStatusCallback = function setRpcConnectionStatusCallback(callback) {
        this.statusCb = callback;
    };

    return Apis;
}();

Apis.db = new Proxy(Apis, {
    get: function get(apis, method) {
        return function () {
            return apis.instance().db_api().exec(method, [].concat(Array.prototype.slice.call(arguments)));
        };
    }
});
Apis.network = new Proxy(Apis, {
    get: function get(apis, method) {
        return function () {
            return apis.instance().network_api().exec(method, [].concat(Array.prototype.slice.call(arguments)));
        };
    }
});
Apis.history = new Proxy(Apis, {
    get: function get(apis, method) {
        return function () {
            return apis.instance().history_api().exec(method, [].concat(Array.prototype.slice.call(arguments)));
        };
    }
});
Apis.crypto = new Proxy(Apis, {
    get: function get(apis, method) {
        return function () {
            return apis.instance().crypto_api().exec(method, [].concat(Array.prototype.slice.call(arguments)));
        };
    }
});
Apis.orders = new Proxy(Apis, {
    get: function get(apis, method) {
        return function () {
            return apis.instance().orders_api().exec(method, [].concat(Array.prototype.slice.call(arguments)));
        };
    }
});
Apis.asset = new Proxy(Apis, {
    get: function get(apis, method) {
        return function () {
            return apis.instance().asset_api().exec(method, [].concat(Array.prototype.slice.call(arguments)));
        };
    }
});


export default Apis;