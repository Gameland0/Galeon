import React, { useContext, useEffect, useState } from 'react';
import { Modal, message } from 'antd';
import Web3 from 'web3';
import { ChatContext } from './ChatContext';
import { Web3Context } from '../contexts/Web3Context';
import { CreditsPaymentContract } from '../contracts/CreditsPayment'
import { USDTContract } from '../contracts/USDTContract'
import clear from '../image/icon_clear.png'
import iconup from '../image/icon_up.svg'
import BigNumber from 'bignumber.js';
import { updataUserCredit } from '../services/api';

export const ChatInput: React.FC = () => {
  const web3Instance = new Web3((window as any).ethereum);
  const { input, setInput, handleSendMessage, isLoading, setIsLoading, handleClearConversation } = useContext(ChatContext);
  const { credits, refreshCredits } = useContext(Web3Context);
  const [showbuy, setshowbuy] = useState(false)
  const [showbuyModal, setshowbuyModal] = useState(false)
  const [creditsAmout, setcreditsAmout] = useState('')
  const [CreditsPric, setCreditsPric] = useState('')

  if (!credits) {
    refreshCredits()
  }

//   useEffect(() => {
//     if (creditsAmout) {
//         const price = new BigNumber(creditsAmout).times(0.02).toNumber().toFixed(2)
//         setCreditsPric(String(price))
//     } else {
//         setCreditsPric('')
//     }
//   },[creditsAmout])

  const buyCredits = async (planId: any) => {
    try {
        const buyAmout = planId === 'PRO' ? 800 : 300
        // const Limit = planId === 'PRO'? '8990000000000000000': '4990000000000000000'
        
        const accounts = await web3Instance.eth.getAccounts();
        const chainId = await web3Instance.eth.getChainId();
        let Limit
        if (chainId === 56) {
            Limit = planId === 'PRO'? '8990000000000000000': '4990000000000000000'
        } else {
            Limit = planId === 'PRO'? '8990000': '4990000'
        }
        
        const CreditsPayment = new CreditsPaymentContract(web3Instance,chainId)
        const usdtContract = new USDTContract(web3Instance, chainId);
        await usdtContract.CreditsPaymentApprove(Limit,accounts[0])
        await CreditsPayment.purchaseSubscription(planId,accounts[0])
        updataUserCredit({amout: buyAmout})
        refreshCredits()
        message.success('Upgrade Successful');
        setshowbuyModal(false)
    } catch (error: any) {
        console.log('buyCredits error:', error); 
        message.error(error.message || error)
    }
  }

  return (
    <div className="input-area">
            {showbuy? (
                <div className="buy-Credits" onClick={() => setshowbuyModal(true)}>
                    <div>Purchase credits</div>
                </div>
            ):''}
            <div className="credit-info" onClick={() => setshowbuy(!showbuy)}>
                Credits: {(credits?.creditBalance|| 0 )+ (credits?.buyBalance || 0) }
                <img src={iconup} alt="" />
            </div>
            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isLoading && 
                    (credits?.creditBalance || 0) > 0 && handleSendMessage()}
                placeholder={(credits?.creditBalance || 0) > 0 ? 
                    "Type your massage here or Type “Create agent”" : "No credits available"}
                disabled={isLoading || (credits?.creditBalance || 0) <= 0}
            />
            <button 
                className="send-button"
                onClick={handleSendMessage} 
                disabled={isLoading || (credits?.creditBalance || 0) <= 0}
            >
                {isLoading ? 'Sending...' : 'Send'}
            </button>
            <button className="clear-button" onClick={handleClearConversation} disabled={isLoading}>
                <img src={clear} alt="" />
            </button>
            <Modal
                title=""
                open={showbuyModal}
                onCancel={() => setshowbuyModal(false)}
                confirmLoading={isLoading}
                className="Purchase-credits-modal contract-deployment-modal"
            >
                <div className="Purchase-table">
                    <div className="table-title">Choose a Plan</div>
                    <div className="table-tab flex">
                        <div className="flex-1">Type</div>
                        <div className="flex-1">Credits</div>
                        <div className="flex-1">Price / Month</div>
                        <div className="flex-1"></div>
                    </div>
                    <div className="table-content flex">
                        <div className="type flex-1">Basic</div>
                        <div className="amount flex-1">300</div>
                        <div className="price flex-1">$4.99</div>
                        <div className="flex-1 flex justify-content align-items">
                            <div className="buy-button" onClick={() => buyCredits('BASIC')}>Upgrade</div>
                        </div>
                    </div>
                    <div className="table-content flex">
                        <div className="type flex-1">Standard</div>
                        <div className="amount flex-1">800</div>
                        <div className="price flex-1">$8.99</div>
                        <div className="flex-1 flex justify-content align-items">
                            <div className="buy-button" onClick={() => buyCredits('PRO')}>Upgrade</div>
                        </div>
                    </div>
                    {/* <div className="table-content flex">
                        <div className="type flex-1">Customize</div>
                        <div className="amount flex-1">
                            <input
                            value={creditsAmout}
                            disabled={isLoading}
                            onChange={(e) => setcreditsAmout(e.target.value)}
                            placeholder=" amount"
                            />
                        </div>
                        <div className="price flex-1">${CreditsPric||0}</div>
                        <div className="flex-1 flex justify-content align-items">
                            <div className="buy-button">Upgrade</div>
                        </div>
                    </div> */}
                </div>
            </Modal>
    </div>

  );
};
