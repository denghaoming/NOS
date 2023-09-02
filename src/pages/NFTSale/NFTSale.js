import React, { Component } from 'react'
import { withNavigation } from '../../hocs'
import "../TokenSale/Presale.css"
import WalletState, { CHAIN_ID, ZERO_ADDRESS, CHAIN_ERROR_TIP } from '../../state/WalletState';
import loading from '../../components/loading/Loading'
import toast from '../../components/toast/toast'
import Web3 from 'web3'
import { NFTSale_ABI } from '../../abi/NFTSale_ABI'
import { showFromWei, showLongAccount } from '../../utils'
import BN from 'bn.js'

import Header from '../Header';

class NFTSale extends Component {
    state = {
        chainId: 0,
        account: "",
        lang: "EN",
        local: {},
    }
    constructor(props) {
        super(props);
        this.refreshInfo = this.refreshInfo.bind(this);
    }
    componentDidMount() {
        this.handleAccountsChanged();
        WalletState.onStateChanged(this.handleAccountsChanged);
        this.refreshInfo();
    }

    componentWillUnmount() {
        WalletState.removeListener(this.handleAccountsChanged);
        if (this._refreshInfoIntervel) {
            clearInterval(this._refreshInfoIntervel);
        }
    }

    handleAccountsChanged = () => {
        const wallet = WalletState.wallet;
        let page = this;
        page.setState({
            chainId: wallet.chainId,
            account: wallet.account,
            lang: WalletState.wallet.lang,
            local: page.getLocal()
        });
        this.getInfo();
    }

    getLocal() {
        let local = {};
        return local;
    }

    _refreshInfoIntervel;
    refreshInfo() {
        if (this._refreshInfoIntervel) {
            clearInterval(this._refreshInfoIntervel);
        }
        this._refreshInfoIntervel = setInterval(() => {
            this.getInfo();
        }, 6000);
    }

    async getInfo() {
        if (WalletState.wallet.chainId != CHAIN_ID) {
            return;
        }
        try {
            const web3 = new Web3(Web3.givenProvider);
            const presaleContract = new web3.eth.Contract(NFTSale_ABI, WalletState.config.NFTSale);

            //获取预售的基本信息
            const shopInfo = await presaleContract.methods.shopInfo().call();
            //暂停购买
            let pauseBuy = shopInfo[0];
            //暂停领取
            let pauseClaim = shopInfo[1];
            //价格
            let price = shopInfo[2];
            //w3n代币加池子数量
            let w3nAmount = shopInfo[3];
            //已卖出份数
            let saleNum = parseInt(shopInfo[4]);
            //总库存
            let qty = parseInt(shopInfo[5]);
            let saleProcess = saleNum * 100 / qty;

            this.setState({
                pauseBuy: pauseBuy,
                pauseClaim: pauseClaim,
                price: price,
                showPrice: showFromWei(price, 18, 6),
                saleNum: saleNum,
                qty: qty,
                saleProcess: saleProcess
            });

            if (WalletState.wallet.account) {
                let account = WalletState.wallet.account;
                const userInfo = await presaleContract.methods.getUserInfo(account).call();
                //购买数量，等于0表示没买过
                let buyAmount = new BN(userInfo[0], 10);
                //余额
                let balance = userInfo[1];
                //总锁仓LP数量
                let lockedLPAmount = new BN(userInfo[2], 10);
                //已领取LP数量
                let claimedLPAmount = new BN(userInfo[3], 10);
                //总释放LP数量
                let releaseLPAmount = new BN(userInfo[4], 10);
                //待释放
                let pendingRelease = lockedLPAmount.sub(releaseLPAmount);
                //待领取
                let pendingClaim = releaseLPAmount.sub(claimedLPAmount);

                this.setState({
                    balance: balance,
                    showBalance: showFromWei(balance, 18, 6),
                    pendingRelease: showFromWei(pendingRelease, 18, 6),
                    pendingClaim: showFromWei(pendingClaim, 18, 6),
                });
            }
        } catch (e) {
            console.log("getInfo", e.message);
            toast.show(e.message);
        } finally {
        }
    }

    async buy() {
        if (WalletState.wallet.chainId != CHAIN_ID) {
            toast.show(CHAIN_ERROR_TIP);
            return;
        }
        let account = WalletState.wallet.account;
        if (!account) {
            this.connectWallet();
            return;
        }
        //暂停
        if (this.state.pauseBuy) {
            toast.show("预售未开放");
            // return;
        }
        //价格
        let cost = new BN(this.state.price, 10);
        //余额
        var balance = new BN(this.state.balance, 10);
        if (balance.lt(cost)) {
            toast.show("余额不足");
            // return;
        }
        loading.show();
        try {
            const web3 = new Web3(Web3.givenProvider);
            const presaleContract = new web3.eth.Contract(NFTSale_ABI, WalletState.config.NFTSale);
            //购买
            var estimateGas = await presaleContract.methods.buy().estimateGas({ from: account, value: cost });
            var transaction = await presaleContract.methods.buy().send({ from: account, value: cost });
            if (transaction.status) {
                toast.show("购买成功");
            } else {
                toast.show("购买失败");
            }
        } catch (e) {
            console.log("e", e);
            toast.show(e.message);
        } finally {
            loading.hide();
        }
    }

    async claimLP() {
        let account = WalletState.wallet.account;
        if (!account) {
            this.connectWallet();
            return;
        }
        if (this.state.pauseClaim) {
            toast.show('未开放领取');
            // return;
        }
        loading.show();
        try {
            const web3 = new Web3(Web3.givenProvider);
            const presaleContract = new web3.eth.Contract(NFTSale_ABI, WalletState.config.NFTSale);
            var estimateGas = await presaleContract.methods.claimLP().estimateGas({ from: account });
            var transaction = await presaleContract.methods.claimLP().send({ from: account });
            if (transaction.status) {
                toast.show('领取成功');
            } else {
                toast.show('领取失败');
            }
        } catch (e) {
            console.log("e", e);
            toast.show(e.message);
        } finally {
            loading.hide();
        }
    }

    connectWallet() {
        WalletState.connetWallet();
    }

    render() {
        return (
            <div className="Presale">
                <Header></Header>
                <div className='Module ModuleTop'>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>预售价格</div>
                        <div>{this.state.showPrice} </div>
                    </div>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>售卖/库存</div>
                        <div>{this.state.saleNum}/{this.state.qty}</div>
                    </div>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>售卖进度</div>
                        <div>{this.state.saleProcess}%</div>
                    </div>
                </div>

                <div className='mt20 prettyBg button' onClick={this.buy.bind(this)}>参与认购</div>
                <div className='Tip mt5 mb40'>余额：{this.state.showBalance}</div>

                <div className='Module ModuleTop mb40'>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>待释放LP</div>
                        <div>{this.state.pendingRelease} </div>
                    </div>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>待领取LP</div>
                        <div>{this.state.pendingClaim}</div>
                    </div>
                    <div className='mt15 Num'></div>
                    <div className='mt20 prettyBg button' onClick={this.claimLP.bind(this)}>领取LP</div>
                </div>
            </div>
        );
    }
}

export default withNavigation(NFTSale);