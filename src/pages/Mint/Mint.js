import React, { Component } from 'react'
import { withNavigation } from '../../hocs'
import "../Token/Token.css"
import "../NFT/NFT.css"
import WalletState, { CHAIN_ID, CHAIN_ERROR_TIP, MAX_INT } from '../../state/WalletState';
import loading from '../../components/loading/Loading'
import toast from '../../components/toast/toast'
import Web3 from 'web3'
import { ERC20_ABI } from "../../abi/erc20"
import { showFromWei, showLongAccount, toWei } from '../../utils'
import BN from 'bn.js'

import Header from '../Header';
import copy from 'copy-to-clipboard';
import { MintPool_ABI } from '../../abi/MintPool_ABI';
import { BinderList_ABI } from '../../abi/BinderList_ABI';

class Mint extends Component {
    state = {
        chainId: 0,
        account: "",
        lang: "EN",
        local: {},
        amountIn: "",
        rewardRate: 10000,
        joinTokens: [],
        userJoinTokens: [],
        selIndex: 0,
        selTokenBalance: '',
        selTokenAmount: '',
        binders: [],
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
        console.log(WalletState.wallet.lang);
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
            //挖矿合约
            const poolContract = new web3.eth.Contract(MintPool_ABI, WalletState.config.MintPool);

            //挖矿合约基本信息
            const baseInfo = await poolContract.methods.getBaseInfo().call();
            //USDT合约
            let usdtAddress = baseInfo[0];
            //USDT精度
            let usdtDecimals = parseInt(baseInfo[1]);
            //代币合约
            let tokenAddress = baseInfo[2];
            //代币精度
            let tokenDecimals = parseInt(baseInfo[3]);
            //全网累计参与USDT数量
            let totalUsdt = baseInfo[4];
            //全网算力
            let totalAmount = new BN(baseInfo[5], 10);
            //今日产出
            let lastDailyReward = new BN(baseInfo[6], 10);
            //今日算力因子，分母为1万
            let dailyAmountRate = parseInt(baseInfo[7]);
            //最小参与数量
            let minAmount = new BN(baseInfo[8], 10);
            //默认上级，首码地址
            let defaultInvitor = baseInfo[9];
            //是否暂停参与
            let pauseJoin = baseInfo[10];
            //代币价格
            let tokenPrice = baseInfo[11];
            //参与代币卖出加池子比例
            let sellRate = parseInt(baseInfo[12]);
            //销毁比例
            let burnRate = 10000 - sellRate;

            let w3nPrice = await poolContract.methods.getTokenETHPrice(WalletState.config.W3N).call();

            this.setState({
                totalUsdt: showFromWei(totalUsdt, usdtDecimals, 2),
                totalAmount: showFromWei(totalAmount, usdtDecimals, 2),
                lastDailyReward: showFromWei(lastDailyReward, tokenDecimals, 2),
                dailyAmountRate: dailyAmountRate / 10000,
                rewardRate: dailyAmountRate,
                usdtAddress: usdtAddress,
                usdtDecimals: usdtDecimals,
                tokenAddress: tokenAddress,
                tokenDecimals: tokenDecimals,
                defaultInvitor: defaultInvitor,
                pauseJoin: pauseJoin,
                minAmount: minAmount,
                showMinAmount: showFromWei(minAmount, usdtDecimals, 2),
                tokenPrice: showFromWei(tokenPrice, usdtDecimals, usdtDecimals),
                burnRate: burnRate,
                sellRate: sellRate,
                w3nPrice: showFromWei(w3nPrice, usdtDecimals, usdtDecimals),
            })

            //挖矿代币列表
            const joinTokensResult = await poolContract.methods.getJoinTokens().call();
            //代币合约地址列表
            let joinTokenAddress = joinTokensResult[0];
            //代币精度列表
            let joinTokenDecimals = joinTokensResult[1];
            //代币符号列表
            let joinTokenSymbols = joinTokensResult[2];
            //代币池子里等值USDT数量列表，用来预估参与数量
            let joinTokenPoolUsdts = joinTokensResult[3];
            //代币池子里代币列表，用来预估参与数量
            let joinTokenPoolTokens = joinTokensResult[4];
            let joinTokenLen = joinTokenAddress.length;
            let joinTokens = [];
            for (let i = 0; i < joinTokenLen; ++i) {
                joinTokens.push({
                    tokenAddress: joinTokenAddress[i],
                    tokenDecimals: parseInt(joinTokenDecimals[i]),
                    tokenSymbol: joinTokenSymbols[i],
                    poolUsdt: new BN(joinTokenPoolUsdts[i], 10),
                    poolToken: new BN(joinTokenPoolTokens[i], 10),
                });
            }

            //当前选项
            let selIndex = this.state.selIndex;
            if (selIndex >= joinTokenLen) {
                selIndex = 0;
            }

            //重新预估参与代币数量
            let selTokenAmount = this.getSelTokenAmount(joinTokens, selIndex, this.state.amountIn);
            this.setState({
                joinTokens: joinTokens,
                selTokenAmount: selTokenAmount,
                selIndex: selIndex,
            })

            let account = WalletState.wallet.account;
            if (account) {
                //用户挖矿信息
                const userInfo = await poolContract.methods.getUserInfo(account).call();
                //总算力
                let userTotalAmount = new BN(userInfo[0], 10);
                //待领取奖励
                let pendingMintReward = new BN(userInfo[1], 10);
                //邀请算力
                let inviteAmount = new BN(userInfo[2], 10);
                //自己参与算力
                let selfAmount = userTotalAmount.sub(inviteAmount);

                //用户代币列表余额
                let userJoinTokenBalances = userInfo[3];
                //用户代币列表授权额度
                let userJoinTokenAllowances = userInfo[4];
                //团队人数
                let teamNum = parseInt(userInfo[5]);
                //个人预计今日产出
                let userLastDailyReward = new BN(0);
                if (!totalAmount.isZero()) {
                    userLastDailyReward = userTotalAmount.mul(lastDailyReward).div(totalAmount);
                }

                let userJoinTokenLen = userJoinTokenBalances.length;
                let userJoinTokens = [];
                for (let i = 0; i < userJoinTokenLen; ++i) {
                    let decimals = joinTokens[i].tokenDecimals;
                    let tokenBalance = new BN(userJoinTokenBalances[i], 10);
                    userJoinTokens.push({
                        tokenBalance: tokenBalance,
                        showTokenBalance: showFromWei(tokenBalance, decimals, 4),
                        tokenAllowance: new BN(userJoinTokenAllowances[i], 10),
                    })
                }

                //用户选中代币余额
                let selTokenBalance = this.getSelTokenBalance(userJoinTokens, selIndex);

                //上级邀请人
                let invitor = await poolContract.methods._invitor(account).call();

                this.setState({
                    userTotalAmount: showFromWei(userTotalAmount, usdtDecimals, 2),
                    selfAmount: showFromWei(selfAmount, usdtDecimals, 2),
                    inviteAmount: showFromWei(inviteAmount, usdtDecimals, 2),
                    pendingMintReward: showFromWei(pendingMintReward, tokenDecimals, 6),
                    invitor: invitor,
                    userJoinTokens: userJoinTokens,
                    selTokenBalance: selTokenBalance,
                    teamNum: teamNum,
                    userLastDailyReward: showFromWei(userLastDailyReward, tokenDecimals, 6),
                })

                //直推列表合约
                const binderListContract = new web3.eth.Contract(BinderList_ABI, WalletState.config.BinderList);
                //直推列表
                let binders = [];
                let startIndex = 0;
                let pageSize = 100;
                let index = 0;
                while (true) {
                    //获取直推列表
                    let bindersResult = await binderListContract.methods.getBinderList(account, startIndex, pageSize).call();
                    //有效记录条数
                    let len = parseInt(bindersResult[0]);
                    //直推列表
                    let binderList = bindersResult[1];
                    for (let i = 0; i < len; ++i) {
                        binders.push({
                            account: binderList[i],
                        });
                        index++;
                    }
                    if (len < pageSize) {
                        break;
                    }
                    startIndex += pageSize;
                }

                this.setState({
                    binders: binders, binderLength: index,
                });
            }
        } catch (e) {
            console.log("getInfo", e);
            toast.show(e.message);
        } finally {
        }
    }

    getSelTokenAmount(tokens, selIndex, amountIn) {
        if (!amountIn) {
            return '';
        }
        let length = tokens.length;
        if (selIndex >= length) {
            return '';
        }
        //USDT精度处理
        let amountInUsdt = toWei(amountIn, this.state.usdtDecimals);
        let token = tokens[selIndex];
        if (token.poolUsdt.isZero()) {
            return '';
        }
        let tokenAmount = amountInUsdt.mul(token.poolToken).div(token.poolUsdt);
        return showFromWei(tokenAmount, token.tokenDecimals, 4);
    }

    getSelTokenBalance(tokens, selIndex) {
        let length = tokens.length;
        if (selIndex >= length) {
            return '';
        }
        return tokens[selIndex].showTokenBalance;
    }

    //参与输入框变化
    handleAmountChange(event) {
        let amount = this.state.amountIn;
        let amountInReward = this.state.amountInReward;
        let selTokenAmount = this.state.selTokenAmount;
        if (event.target.validity.valid) {
            amount = event.target.value;
            amountInReward = parseInt(amount) * this.state.rewardRate / 10000;
            selTokenAmount = this.getSelTokenAmount(this.state.joinTokens, this.state.selIndex, amount);
        }
        this.setState({
            amountIn: amount,
            amountInReward: amountInReward,
            selTokenAmount: selTokenAmount
        });
    }

    connectWallet() {
        WalletState.connetWallet();
    }

    //参与挖矿
    async deposit() {
        if (WalletState.wallet.chainId != CHAIN_ID || !WalletState.wallet.account) {
            toast.show(CHAIN_ERROR_TIP);
            return;
        }
        loading.show();
        try {
            let amount = this.state.amountIn;
            //参与数量，处理精度
            let amountUsdt = toWei(amount, this.state.usdtDecimals);
            if (amountUsdt.lt(this.state.minAmount)) {
                toast.show("最少参与" + this.state.showMinAmount);
            }

            let selIndex = this.state.selIndex;
            let token = this.state.joinTokens[selIndex];
            //预估参与代币数量
            let tokenAmount = token.poolToken.mul(amountUsdt).div(token.poolUsdt);
            //滑点处理，防止被夹，5%滑点
            let maxTokenAmount = tokenAmount.mul(new BN(105)).div(new BN(100));

            let userJoinToken = this.state.userJoinTokens[selIndex]
            //可用代币余额
            var tokenBalance = userJoinToken.tokenBalance;
            if (tokenBalance.lt(maxTokenAmount)) {
                toast.show(token.tokenSymbol + " 余额不足");
                // return;
            }

            const web3 = new Web3(Web3.givenProvider);
            let account = WalletState.wallet.account;
            let approvalNum = userJoinToken.tokenAllowance;
            //LP授权额度不够了，需要重新授权
            if (approvalNum.lt(maxTokenAmount)) {
                const tokenContract = new web3.eth.Contract(ERC20_ABI, token.tokenAddress);
                var transaction = await tokenContract.methods.approve(WalletState.config.MintPool, MAX_INT).send({ from: account });
                if (!transaction.status) {
                    toast.show("授权失败");
                    return;
                }
            }
            const poolContract = new web3.eth.Contract(MintPool_ABI, WalletState.config.MintPool);
            //邀请人
            let invitor = this.getRef();
            if (!invitor) {
                invitor = this.state.defaultInvitor;
            }

            //参与挖矿，参数依次：选项序号，参与USDT，代币数量，邀请人
            var estimateGas = await poolContract.methods.deposit(selIndex, amountUsdt, maxTokenAmount, invitor).estimateGas({ from: account });
            var transaction = await poolContract.methods.deposit(selIndex, amountUsdt, maxTokenAmount, invitor).send({ from: account });
            if (transaction.status) {
                toast.show("参与成功");
            } else {
                toast.show("参与失败");
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

    //领取奖励
    async claim() {
        let account = WalletState.wallet.account;
        if (!account) {
            this.connectWallet();
            return;
        }
        loading.show();
        try {
            const web3 = new Web3(Web3.givenProvider);
            const poolContract = new web3.eth.Contract(MintPool_ABI, WalletState.config.MintPool);
            var estimateGas = await poolContract.methods.claim().estimateGas({ from: account });
            var transaction = await poolContract.methods.claim().send({ from: account });
            if (transaction.status) {
                toast.show("领取成功");
            } else {
                toast.show("领取失败");
            }
        } catch (e) {
            console.log("e", e);
            toast.show(e.message);
        } finally {
            loading.hide();
        }
    }

    //邀请好友
    invite() {
        if (WalletState.wallet.account) {
            var url = window.location.href;
            url = url.split("?")[0];
            let inviteLink = url + "?ref=" + WalletState.wallet.account;
            if (copy(inviteLink)) {
                toast.show("邀请链接已复制")
            } else {
                toast.show("邀请失败")
            }
        }
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

        } else {
            selIndex = i;
        }
        let selTokenAmount = this.getSelTokenAmount(this.state.joinTokens, selIndex, this.state.amountIn);
        let selTokenBalance = this.getSelTokenBalance(this.state.userJoinTokens, selIndex);
        this.setState({
            selIndex: selIndex,
            selTokenAmount: selTokenAmount,
            selTokenBalance: selTokenBalance
        });
    }

    render() {
        return (
            <div className="Token NFT">
                <Header></Header>
                <div className='Module ModuleTop'>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>W3N价格</div>
                        <div>{this.state.w3nPrice} U</div>
                    </div>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>MOSS价格</div>
                        <div>{this.state.tokenPrice} U</div>
                    </div>
                    <div className='ModuleContentWitdh RuleTitle mt5'>
                        <div>全网累计参与价值</div>
                        <div>{this.state.totalUsdt} U</div>
                    </div>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>全网算力</div>
                        <div>{this.state.totalAmount}</div>
                    </div>
                    <div className='ModuleContentWitdh RuleTitle mt5'>
                        <div>今日产出</div>
                        <div>{this.state.lastDailyReward}</div>
                    </div>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>当前因子</div>
                        <div>{this.state.dailyAmountRate}</div>
                    </div>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>参与代币分配</div>
                        <div>{this.state.burnRate}:{this.state.sellRate}</div>
                    </div>

                    <div className='ModuleContentWitdh RuleTitle mt5'>
                        <div>个人今日预计收益</div>
                        <div>{this.state.userLastDailyReward}</div>
                    </div>
                </div>

                <div className='Module ModuleTop'>
                    <div className='Items flex'>
                        {this.state.joinTokens.map((item, index) => {
                            return <div className={this.getItemClass(index)} key={index} onClick={this.setSelItem.bind(this, index)}>
                                <div className='flex align-center'>
                                    <div className='Unit'>{item.tokenSymbol}</div>
                                </div>
                            </div>
                        })}
                    </div>

                    <div className='InputBg mt10'>
                        <input className="Input" type="text" value={this.state.amountIn}
                            placeholder={'请输入数量,至少' + this.state.showMinAmount}
                            onChange={this.handleAmountChange.bind(this)} pattern="[0-9]*" >
                        </input>
                    </div>
                    <div className='mt10 prettyBg button' onClick={this.deposit.bind(this)}>参与</div>
                    <div className='ModuleContentWitdh RuleTitle mt10'>
                        <div>代币余额</div>
                        <div>{this.state.selTokenBalance}</div>
                    </div>
                    <div className='ModuleContentWitdh RuleTitle mt10'>
                        <div>预计消耗代币</div>
                        <div>{this.state.selTokenAmount}</div>
                    </div>
                    <div className='ModuleContentWitdh RuleTitle mt10'>
                        <div>预计获得算力</div>
                        <div>{this.state.amountInReward}</div>
                    </div>
                </div>

                <div className='Module ModuleTop'>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>我的总算力</div>
                        <div>{this.state.userTotalAmount}</div>
                    </div>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>个人参与算力</div>
                        <div>{this.state.selfAmount}</div>
                    </div>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>邀请算力</div>
                        <div>{this.state.inviteAmount}</div>
                    </div>
                    <div className='ModuleContentWitdh RuleTitle mt10'>
                        <div>待领取奖励</div>
                        <div>{this.state.pendingMintReward}</div>
                    </div>
                    <div className='mt10 prettyBg button' onClick={this.claim.bind(this)}>领取</div>
                </div>

                <div className='Module ModuleTop'>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>上级邀请人</div>
                        <div>{showLongAccount(this.state.invitor)}</div>
                    </div>
                    <div className='ModuleContentWitdh RuleTitle'>
                        <div>团队人数</div>
                        <div>{this.state.teamNum}</div>
                    </div>
                    <div className='mt20 prettyBg button' onClick={this.invite.bind(this)}>邀请</div>
                </div>

                <div className='Module ModuleTop'>
                    <div className='Title'>直推人数 {this.state.binderLength}</div>
                    {this.state.binders.map((item, index) => {
                        return <div className='mt5' key={index}>
                            <div className='ModuleContentWitdh RuleTitle'>
                                <div className=''>NO.{index + 1} {item.account}</div>
                                <div className=''></div>
                            </div>
                        </div>
                    })}
                </div>

                <div className='mt20'></div>
            </div>
        );
    }
}

export default withNavigation(Mint);