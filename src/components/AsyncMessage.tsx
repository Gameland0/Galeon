import React, { useState, useEffect, useContext } from 'react';
import { Button, message } from 'antd';
import { ChatContext, Message } from './ChatContext';
import { renderMessage } from './messageUtils';
import { compileSolanaProgram } from '../services/api';


interface AsyncMessageProps {
  msg: Message & {
    type: string;
    gameType: any;
  };
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
  const { addContract, updateContract, setDeployModalVisible, setSelectedContracts, contracts, updateGameCode } = useContext(ChatContext)!;
  const [contractFiles, setContractFiles] = useState<ContractFile[]>([]);
  const [isShow, setIsShow] = useState(true)

  const hasDeployableContract = (content: string): boolean => {
    // 🔧 修复：更宽松的代码块匹配，兼容agent生成的格式
    // 确保content是字符串类型
    if (typeof content !== 'string') {
      return false;
    }
    const codeBlocks = content.match(/```[\s\S]*?```/g);
    if (!codeBlocks) return false;

    return codeBlocks.some(block => {
      // 更宽松的匹配：支持有无换行符的情况
      const codeMatch = block.match(/```(\w+)?\s*([\s\S]*?)```/);
      if (!codeMatch) return false;

      const [, language, code] = codeMatch;
      
      // 检查是否是智能合约代码
      return isContractCode(code, language?.toLowerCase());
    });
  };
  // 判断代码是否是智能合约代码
  const isContractCode = (code: string, language?: string): boolean => {
    // Solidity 合约特征 - 更全面的检测
    if (language === 'solidity' || language === 'sol' || code.includes('pragma solidity')) {
      return code.includes('contract ') && (
        code.includes('function ') || 
        code.includes('constructor') || 
        code.includes('event ') ||
        code.includes('modifier ') ||
        code.includes('mapping(') ||
        code.includes('uint256') ||
        code.includes('address') ||
        code.includes('msg.sender') ||
        code.includes('require(') ||
        code.includes('emit ') ||
        code.includes('payable') ||
        code.includes('view') ||
        code.includes('pure')
      );
    }

    // 更宽松的 Solidity 检测 - 基于内容
    if (code.includes('contract ') && (
        code.includes('function ') || 
        code.includes('constructor') || 
        code.includes('event ') ||
        code.includes('modifier ') ||
        code.includes('mapping(') ||
        code.includes('uint256') ||
        code.includes('address') ||
        code.includes('msg.sender') ||
        code.includes('require(') ||
        code.includes('// SPDX-License-Identifier')
      )) {
      return true;
    }

    // Solana Anchor 合约特征
    if (language === 'rust' || language === 'anchor') {
      return (
        code.includes('#[program]') || 
        code.includes('use anchor_lang::prelude::*') ||
        (code.includes('pub mod') && code.includes('#[derive(Accounts)]'))
      );
    }

    // Solana Cargo (纯 Rust 项目) 特征
    if (language === 'cargo' || language === 'toml') {
      return code.includes('[package]') && code.includes('[dependencies]');
    }

    // Move 合约特征
    if (language === 'move') {
      return code.includes('module ') && code.includes('public entry fun');
    }

    return false;
  };
  
  useEffect(() => {
    // 1. 渲染消息内容
    (async () => {
      const rendered = await renderMessage(msg, index);
      setRenderedMessage(rendered);
    })();

    if (msg.files) {
    }

    // 2. 优先基于内容解析合约文件
    const contentFiles = parseContractFiles(msg.content);
    if (contentFiles.length > 0) {
      setContractFiles(contentFiles);
      contentFiles.forEach(f => addContract(f.name, f.content, f.type));
      return;
    }

    // 3. 内容解析无结果时，回退使用 msg.files
    if (msg.files && Array.isArray(msg.files) && msg.files.length > 0) {
      const fallbackFiles = msg.files.map(file => {
        const contentStr = typeof file.content === 'string' ? file.content : String(file.content);
        const type = determineContractType(contentStr, file.language?.toLowerCase());
        return { name: file.name, content: contentStr, type } as ContractFile;
      });
      setContractFiles(fallbackFiles);
      fallbackFiles.forEach(f => addContract(f.name, f.content, f.type));
    }
  }, [msg, index]);

  useEffect(() => {
    const filterData = contracts.filter((item: any) => !item.isDeployed);
    setIsShow(filterData.length > 0);
  }, [contracts]);

  const parseContractFiles = (content: string): ContractFile[] => {
    // 🔧 修复：更宽松的代码块匹配，兼容agent生成的格式
    // 确保content是字符串类型
    if (typeof content !== 'string') {
      return [];
    }
    const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
    
    return codeBlocks.map(block => {
      // 更宽松的匹配：支持有无换行符的情况
      const codeMatch = block.match(/```(\w+)?\s*([\s\S]*?)```/);
      if (!codeMatch) return null;
      const [, language, code] = codeMatch;
      
      
      // 只处理可能的合约代码
      if (!isContractCode(code, language?.toLowerCase())) {
        return null;
      }
      
      const type = determineContractType(code, language?.toLowerCase());
      
      const name = extractContractName(code, type);
      
      return { name, content: code.trim(), type };
    }).filter((file): file is ContractFile => file !== null);
  };

  const determineContractType = (code: string, language?: string): "solidity" | "solana-anchor" | "solana-cargo" => {
    
    // 🔧 修复：优先检查Solana相关的特征，避免被Solidity误判
    
    // Solana Anchor 检测 - 最高优先级
    if (code.includes('use anchor_lang::prelude::*') || 
        code.includes('#[program]') ||
        code.includes('declare_id!') ||
        code.includes('#[derive(Accounts)]') ||
        code.includes('anchor_lang') ||
        (language === 'rust' && (code.includes('#[program]') || code.includes('pub struct') && code.includes('Context<')))) {
      return 'solana-anchor';
    }

    // Solana Cargo 检测
    if (code.includes('[package]') && code.includes('[dependencies]')) {
      return 'solana-cargo';
    }

    if (code.includes('use solana_program::') ||
        (language === 'rust' && code.includes('solana_program'))) {
      return 'solana-cargo';
    }

    // 检查显式的语言标识
    if (language) {
      if (language === 'anchor') {
        return 'solana-anchor';
      }
      if (language === 'cargo' || language === 'toml') {
        return 'solana-cargo';
      }
      if (language === 'rust') {
        // 🔧 修复：对于 Rust 代码，如果没有明确的Solana特征，默认为Anchor
        return 'solana-anchor';
      }
      if (language === 'solidity' || language === 'sol') {
        return 'solidity';
      }
    }

    // Solidity 检测 - 放在后面，避免误判Rust代码
    if (code.includes('pragma solidity') || 
        code.includes('// SPDX-License-Identifier') ||
        (code.includes('contract ') && (
          code.includes('function ') || 
          code.includes('constructor') || 
          code.includes('event ') ||
          code.includes('modifier ') ||
          code.includes('mapping(') ||
          code.includes('uint256') ||
          code.includes('address') ||
          code.includes('msg.sender') ||
          code.includes('require(')
        ))) {
      return 'solidity';
    }

    // 最后检查通用的 Rust 特征
    if (code.includes('fn main()') || 
        code.includes('pub fn') ||
        code.includes('use std::') ||
        code.includes('impl ') ||
        code.includes('struct ')) {
      return 'solana-anchor';
    }

    // 🔧 修复：默认返回取决于上下文线索
    if (language === 'rust' || code.match(/\b(pub|fn|impl|struct|enum)\b/)) {
      return 'solana-anchor';
    }

    return 'solidity';
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


  
  return (
    <>
      {/* 📎 图片显示已移至 messageUtils.tsx 的 renderMessage 函数中，避免显示位置错误 */}
      {renderedMessage}

      {contracts.length > 0 && (hasDeployableContract(msg.content) || (msg.files && msg.files.some(f => isContractCode(String(f.content), f.language?.toLowerCase())))) && isShow && (
        <div style={{
          textAlign: 'center',
          padding: '16px',
          margin: '16px 0',
          background: '#f8f9fa',
          borderRadius: '8px',
          border: '2px dashed #28a745',
          position: 'relative',
          zIndex: 10
        }}>
          <Button
            type="primary"
            size="large"
            onClick={handleDeploy}
            style={{
              width: '80%',
              minWidth: '200px',
              height: '45px',
              fontSize: '16px',
              fontWeight: '600',
              background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
              border: 'none',
              boxShadow: '0 4px 15px rgba(40, 167, 69, 0.3)'
            }}
          >
            🚀 Deploy Smart Contracts
          </Button>
        </div>
      )}
    </>
  );
});
