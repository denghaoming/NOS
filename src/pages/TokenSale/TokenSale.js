import React, { Component } from 'react'
import { withNavigation } from '../../hocs'
import "./Presale.css"
import WalletState, { CHAIN_ID, ZERO_ADDRESS, CHAIN_ERROR_TIP, CHAIN_SYMBOL, MAX_INT } from '../../state/WalletState';
import loading from '../../components/loading/Loading'
import toast from '../../components/toast/toast'
import Web3 from 'web3'
import { TokenSale_ABI } from '../../abi/TokenSale_ABI'
import { MintPool_ABI } from '../../abi/MintPool_ABI';
import { showFromWei, showLongAccount } from '../../utils'
import BN from 'bn.js'

import copy from 'copy-to-clipboard';
import IconInvite from "../../images/IconInvite.png"

import Header from '../Header';

class TokenSale extends Component {
    state = {
        chainId: 0,
        account: "",
        lang: "EN",
        local: {},
        allSaleInfo: [],
        selIndex: -1,
        invitor: ZERO_ADDRESS,
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
            const presaleContract = new web3.eth.Contract(TokenSale_ABI, WalletState.config.TokenSale);

            //获取预售的基本信息
            const shopInfo = await presaleContract.methods.shopInfo().call();
            //暂停购买
            let pauseBuy = shopInfo[0];
            //暂停领取
            let pauseClaim = shopInfo[1];
            //NFT奖励条件
            let rewardNFTCondition = parseInt(shopInfo[2]);

            //挖矿合约
            const poolContract = new web3.eth.Contract(MintPool_ABI, WalletState.config.MintPool);

            //挖矿合约基本信息
            const baseInfo = await poolContract.methods.getBaseInfo().call();
            //首码地址，默认邀请人
            let defaultInvitor = baseInfo[9];

            this.setState({
                pauseBuy: pauseBuy,
                pauseClaim: pauseClaim,
                rewardNFTCondition: rewardNFTCondition,
                defaultInvitor: defaultInvitor
            });

            let allSaleInfo = await presaleContract.methods.allSaleInfo().call();
            //价格
            let prices = allSaleInfo[0];
            //w3n代币加池子数量
            let w3nAmounts = allSaleInfo[1];
            //已卖出份数
            let saleNums = allSaleInfo[2];
            let len = prices.length;
            let saleInfos = [];
            for (let i = 0; i < len; ++i) {
                saleInfos.push({
                    //每份价格
                    price: prices[i],
                    showPrice: showFromWei(prices[i], 18, 6),
                });
            }
            this.setState({ allSaleInfo: saleInfos });

            if (WalletState.wallet.account) {
                let account = WalletState.wallet.account;
                const userInfo = await presaleContract.methods.getUserInfo(account).call();
                //购买数量，等于0表示没买过
                let buyAmount = new BN(userInfo[0], 10);
                //余额
                let balance = userInfo[1];
                //直推邀请购买人数
                let saleInviteAccount = parseInt(userInfo[2]);
                //奖励NFT数量
                let claimedNFTNum = parseInt(userInfo[3]);
                //总锁仓LP数量
                let lockedLPAmount = new BN(userInfo[4], 10);
                //已领取LP数量
                let claimedLPAmount = new BN(userInfo[5], 10);
                //总释放LP数量
                let releaseLPAmount = new BN(userInfo[6], 10);
                //待释放
                let pendingRelease = lockedLPAmount.sub(releaseLPAmount);
                //待领取
                let pendingClaim = releaseLPAmount.sub(claimedLPAmount);

                //上级邀请人
                let invitor = await poolContract.methods._invitor(account).call();

                this.setState({
                    balance: balance,
                    showBalance: showFromWei(balance, 18, 6),
                    claimedNFTNum: claimedNFTNum,
                    saleInviteAccount: saleInviteAccount,
                    pendingRelease: showFromWei(pendingRelease, 18, 6),
                    pendingClaim: showFromWei(pendingClaim, 18, 6),
                    invitor: invitor,
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
        //选项
        let saleId = this.state.selIndex;
        if (saleId < 0) {
            toast.show("请选择预售金额");
            return;
        }
        let saleInfo = this.state.allSaleInfo[saleId];
        //价格
        let cost = new BN(saleInfo.price, 10);
        //余额
        var balance = new BN(this.state.balance, 10);
        if (balance.lt(cost)) {
            toast.show("余额不足");
            // return;
        }
        loading.show();
        try {
            const web3 = new Web3(Web3.givenProvider);
            //邀请人
            let invitor = this.getRef();
            if (!invitor) {
                invitor = this.state.defaultInvitor;
            }
            const presaleContract = new web3.eth.Contract(TokenSale_ABI, WalletState.config.TokenSale);
            //购买
            var estimateGas = await presaleContract.methods.buy(saleId, invitor).estimateGas({ from: account, value: cost });
            var transaction = await presaleContract.methods.buy(saleId, invitor).send({ from: account, value: cost });
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
            const presaleContract = new web3.eth.Contract(TokenSale_ABI, WalletState.config.TokenSale);
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

    //获取邀请人
    getRef() {
        //先从链接获取，如果有，直接使用
        var url = window.location.href;
        var obj = new Object();
        var scan_url = url.split("?");
        if (2 == scan_url.length) {
            scan_url = scan_url[1];
            var strs = scan_url.split("&");
            for (var x in strs) {
                var arr = strs[x].split("=");
                obj[arr[0]] = arr[1];
                //链接里有邀请人
                if ("ref" == arr[0] && arr[1]) {
                    return arr[1];
                }
            }
        }
        //从浏览器缓存获取，这里可能部分浏览器不支持
        var storage = window.localStorage;
        if (storage) {
            return storage["ref"];
        }
        return null;
    }

    invite() {
        if (WalletState.wallet.account) {
            var url = window.location.href;
            url = url.split("?")[0];
            let inviteLink = url + "?ref=" + WalletState.wallet.account;
            if (copy(inviteLink)) {
                toast.show('邀请链接已复制')
            } else {
                toast.show('链接复制失败')
            }
        }

    }

    connectWallet() {
        WalletState.connetWallet();
    }

    getItemClass(i) {
        if (i == this.state.selIndex) {
            return "Item Item-Sel";
        }
        return "Item Item-Nor";
    }

    setSelItem(i) {
        let selIndex = this.state.selIndex;
        if (selIndex == i) {
            selIndex = -1;
        } else {
            selIndex = i;
        }
        this.setState({ selIndex: selIndex });
    }

    render() {
        return (
            <div className="Presale">
                <Header></Header>
                <div className='Items flex'>
                    {this.state.allSaleInfo.map((item, index) => {
                        return <div className={this.getItemClass(index)} key={index} onClick={this.setSelItem.bind(this, index)}>
                            <div className='flex align-center'>
                                <div className='Num'>{item.showPrice}</div>
                            </div>
                        </div>
                    })}
                </div>
                <div className='mt20 prettyBg button' onClick={this.buy.bind(this)}>参与认购</div>
                <div className='Tip mt5 mb40'>余额：{this.state.showBalance}</div>

                <div className='Module ModuleTop mb40'>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div className='RuleTitleBg prettyBg' onClick={this.invite.bind(this)}>
                            <img className='clock' src={IconInvite}></img>
                            <div className='Tip'>邀请好友</div>
                        </div>
                    </div>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>邀请人</div>
                        <div>{showLongAccount(this.state.invitor)}</div>
                    </div>

                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>奖励NFT数量</div>
                        <div>{this.state.claimedNFTNum}</div>
                    </div>

                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>邀请进度</div>
                        <div>{this.state.saleInviteAccount}/{this.state.rewardNFTCondition}</div>
                    </div>

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

export default withNavigation(TokenSale);