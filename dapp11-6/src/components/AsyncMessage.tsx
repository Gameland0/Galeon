import React, { useState, useEffect, useContext } from 'react';
import { Button } from 'antd';
import { ChatContext, Message } from './ChatContext';
import { renderMessage } from './messageUtils';

interface AsyncMessageProps {
  msg: Message;
  index: number;
}

interface ContractFile {
  name: string;
  content: string;
  type: "solidity" | "solana-anchor" | "solana-cargo";
  dependencies?: string[];  // 用于 Cargo.toml 依赖
  isMain?: boolean;        // 标记主程序文件
}

export const AsyncMessage: React.FC<AsyncMessageProps> = React.memo(({ msg, index }) => {
  const [renderedMessage, setRenderedMessage] = useState<JSX.Element | null>(null);
  const { addContract, setDeployModalVisible, setSelectedContracts, contracts } = useContext(ChatContext)!;
  const [contractFiles, setContractFiles] = useState<ContractFile[]>([]);
  const [isShow, setIsShow] = useState(true)

  const hasDeployableContract = (content: string): boolean => {
    // 匹配代码块
    const codeBlocks = content.match(/```[\s\S]*?```/g);
    if (!codeBlocks) return false;

    return codeBlocks.some(block => {
      const codeMatch = block.match(/```(\w+)?\n([\s\S]*?)```/);
      if (!codeMatch) return false;

      const [, language, code] = codeMatch;
      
      // 检查是否是智能合约代码
      return isContractCode(code, language?.toLowerCase());
    });
  };
  // 判断代码是否是智能合约代码
  const isContractCode = (code: string, language?: string): boolean => {
    // Solidity 合约特征
    if (language === 'solidity' || code.includes('pragma solidity')) {
      return code.includes('contract ') && (
        code.includes('function ') || 
        code.includes('constructor') || 
        code.includes('event ') ||
        code.includes('modifier ')
      );
    }

    // Solana 合约特征
    if (language === 'rust' || language === 'anchor') {
      return (
        code.includes('#[program]') || 
        code.includes('use anchor_lang::prelude::*') ||
        (code.includes('pub mod') && code.includes('#[derive(Accounts)]'))
      );
    }

    // Move 合约特征
    if (language === 'move') {
      return code.includes('module ') && code.includes('public entry fun');
    }

    return false;
  };

  useEffect(() => {
    const render = async () => {
      const rendered = await renderMessage(msg, index);
      setRenderedMessage(rendered);
    };
    render();

    // 检测 EVM 合约代码
    if (msg.content.includes('pragma solidity') && msg.content.match(/```solidity(\w+)?\n([\s\S]*?)```/)) {
      const files = parseContractFiles(msg.content);
      // console.log('files:',files)
      setContractFiles(files);
      files.forEach(file => {
        addContract(file.name, file.content, file.type);
      });
    }
  }, [msg, index, addContract]);

  useEffect(()=> {
    const filterData = contracts.filter((item: any) =>{
      return !item.isDeployed
    })
    if (filterData.length) {
      setIsShow(true)
    } else {
      setIsShow(false)
    }
  },[contracts])

  const parseContractFiles = (content: string): ContractFile[] => {
    const codeBlocks = content.match(/```solidity[\s\S]*?```/g) || [];
    return codeBlocks.map(block => {
      const codeMatch = block.match(/```(\w+)?\n([\s\S]*?)```/);
      if (!codeMatch) return null;
      const [, language, code] = codeMatch;
      const type = determineContractType(code, language);
      const name = extractContractName(code, type);
      return { name, content: code.trim(), type };
    }).filter((file): file is ContractFile => file !== null);
  };

   const determineContractType = (code: string, language?: string) => {
    // 1. 首先根据明确声明的语言判断
    if (language) {
      if (language === 'solidity') return 'solidity';
      if (language === 'anchor') return 'solana-anchor';
      if (language === 'cargo') return 'solana-cargo';
    }
  
    // 2. 然后根据代码特征判断
    // Anchor 特征检查
    if (code.includes('use anchor_lang::prelude::*') || 
        code.includes('#[program]') ||
        code.includes('declare_id!')) {
      return 'solana-anchor';
    }
  
    // Cargo.toml 文件检查
    if (code.includes('[package]') && code.includes('[dependencies]')) {
      return 'solana-cargo';
    }
  
    // 原生 Solana 程序检查
    if (code.includes('use solana_program::')) {
      return 'solana-cargo';
    }
  
    // Solidity 检查
    if (code.includes('pragma solidity')) {
      return 'solidity';
    }
  
    // 默认返回基于语言的判断
    if (language === 'rust') {
      // 检查是否包含 Anchor 特定的依赖声明
      if (code.includes('anchor = ') || code.includes('anchor-lang = ')) {
        return 'solana-anchor';
      }
      return 'solana-cargo';
    }
  
    return 'solidity';  // 默认返回
  };
  
  const extractContractName = (code: string, type: "solidity" | "solana-anchor" | "solana-cargo"): string => {
    switch (type) {
      case 'solidity':
        const solidityMatch = code.match(/contract\s+(\w+)/);
        return solidityMatch ? solidityMatch[1] : 'UnnamedSolidityContract';
      
      case 'solana-anchor':
        const programMatch = code.match(/#\[program\]\s*(?:pub\s+)?mod\s+(\w+)/);
        if (programMatch) return programMatch[1];
        
        const moduleMatch = code.match(/pub\s+mod\s+(\w+)/);
        return moduleMatch ? moduleMatch[1] : 'UnnamedAnchorProgram';
      
      case 'solana-cargo':
        if (code.includes('[package]')) {
          const nameMatch = code.match(/name\s*=\s*"([^"]+)"/);
          return nameMatch ? nameMatch[1] : 'UnnamedCargoProject';
        }
        const libMatch = code.match(/(?:pub\s+)?mod\s+(\w+)/);
        return libMatch ? libMatch[1] : 'UnnamedSolanaProgram';
    }
  };

  const handleDeploy = () => {
    setSelectedContracts(contractFiles.map(file => ({ name: file.name, type: file.type })));
    setDeployModalVisible(true);
  };


  if (!renderedMessage) {
    return null;
  }

  // const deployButton = msg.content.includes('Contract ID:') ? (
  //   <Button onClick={() => {
  //     const contractId = msg.content.split('Contract ID:')[1].trim();
  //     handleDeployClick(contractId);
  //   }}>
  //     Deploy Contract
  //   </Button>
  // ) : null;

  
  return (
    <>
      {renderedMessage}
      {contracts.length > 0 && hasDeployableContract(msg.content) && isShow && (
        <Button style={{ width: '80%' }} onClick={handleDeploy}>
          Deploy Contracts
        </Button>
      )}
    </>
  );
});
