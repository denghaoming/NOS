import Web3 from 'web3'
import { CHAIN_ID, CHAIN_SYMBOL, CHAIN_ERROR_TIP } from '../abi/config'
class WalletState {
    wallet = {
        chainId: null,
        account: null,
        lang: "EN"
    }

    config = {
        //OKC
        W3N: "0xEF745993b2dFD14251B8249870c00AAE3dEf7471",
        TokenSale: "0x92d60f6c21b5BE7D5e61cEf322Dbaf7aC79ec162",
        NFTSale: "0xC1fe2a0C8E2804E31f7a2991Fb7a284d722aDf72",
        MintPool: "0xC461593f5f486A17Fb8e57ac9BD288Be401a0939",
        BinderList: "0xd65F9a16cDE165A358a509E7Adb7D7985F93aee0",

        //BSC
        // MintPool:"0x0319Ec98369895c15cC6F5B7605111DCaF63102c",
    }

    listeners = []

    constructor() {
        this.subcripeWeb3();
        this.getConfig();
    }
    //listen the wallet event
    async subcripeWeb3() {
        let page = this;
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', function (accounts) {
                page.connetWallet();
                // window.location.reload();
            });
            window.ethereum.on('chainChanged', function (chainId) {
                page.connetWallet();
                page.getConfig();
                // window.location.reload();
            });
        }
        // window.ethereum.on('connect', (connectInfo) => { });
        // window.ethereum.on('disconnect', (err) => { });
        // window.ethereum.isConnected();

        //         4001
        // The request was rejected by the user
        // -32602
        // The parameters were invalid
        // -32603
        // Internal error
    }

    async getConfig() {
        if (!Web3.givenProvider) {
            console.log("not wallet found");
        }

        var storage = window.localStorage;
        if (storage) {
            var lang = storage["lang"];
            if (lang) {
                this.wallet.lang = lang;
            }
        }
        this.notifyAll();
    }

    async connetWallet() {
        let provider = Web3.givenProvider || window.ethereum;
        if (provider) {
            Web3.givenProvider = provider;
            const web3 = new Web3(provider);
            const chainId = await web3.eth.getChainId();
            this.wallet.chainId = chainId;
            const accounts = await web3.eth.requestAccounts();
            this.wallet.account = accounts[0];
            //Test
            // this.wallet.account = "0x43e3931d57fdd866e104011997a530a531926908";
            this.notifyAll();
        } else {
            setTimeout(() => {
                this.connetWallet();
            }, 3000);
            // window.location.reload();
        }
    }

    changeLang(lang) {
        this.wallet.lang = lang;
        var storage = window.localStorage;
        if (storage) {
            storage["lang"] = lang;
        }
        this.notifyAll();
    }

    onStateChanged(cb) {
        this.listeners.push(cb);
    }

    removeListener(cb) {
        this.listeners = this.listeners.filter(item => item !== cb);
    }

    notifyAll() {
        for (let i = 0; i < this.listeners.length; i++) {
            const cb = this.listeners[i];
            cb();
        }
    }

}
export { CHAIN_ID, CHAIN_SYMBOL, CHAIN_ERROR_TIP };
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const MAX_INT = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
export default new WalletState();