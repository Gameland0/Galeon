  interface ContractImport {
    path: string;
    version: string;
    alias?: string;
  }
  
  interface ContractLibrary {
    name: string;
    baseUrl: string;
    defaultVersion: string;
    versionPattern?: RegExp;
    pathTransform?: (path: string) => string;
  }
  
  // 定义主要的智能合约库
  const CONTRACT_LIBRARIES: { [key: string]: ContractLibrary } = {
    '@openzeppelin': {
      name: 'OpenZeppelin',
      baseUrl: 'https://github.com/OpenZeppelin/openzeppelin-contracts/blob',
      defaultVersion: 'v4.9.0',
      versionPattern: /^[0-9]+\.[0-9]+\.[0-9]+$/,
      pathTransform: (path: string) => path.replace('@openzeppelin/contracts', 'contracts')
    },
    '@chainlink': {
      name: 'Chainlink',
      baseUrl: 'https://github.com/smartcontractkit/chainlink/blob',
      defaultVersion: 'v2.2.0',
      pathTransform: (path: string) => path.replace('@chainlink/contracts', 'contracts')
    },
    '@uniswap': {
      name: 'Uniswap',
      baseUrl: 'https://github.com/Uniswap/v3-core/blob',
      defaultVersion: 'v1.0.0',
      pathTransform: (path: string) => path.replace('@uniswap/v3-core', 'contracts')
    },
    '@aave': {
      name: 'Aave',
      baseUrl: 'https://github.com/aave/aave-protocol/blob',
      defaultVersion: 'v1.0.0',
      pathTransform: (path: string) => path.replace('@aave/protocol', 'contracts')
    },
    '@compound': {
      name: 'Compound',
      baseUrl: 'https://github.com/compound-finance/compound-protocol/blob',
      defaultVersion: 'v2.8.1',
      pathTransform: (path: string) => path.replace('@compound-finance/contracts', 'contracts')
    },
    '@1inch': {
      name: '1inch',
      baseUrl: 'https://github.com/1inch/1inch-protocol/blob',
      defaultVersion: 'v2.0.0',
      pathTransform: (path: string) => path.replace('@1inch/contracts', 'contracts')
    },
    '@gnosis': {
      name: 'Gnosis',
      baseUrl: 'https://github.com/gnosis/gp-v2-contracts/blob',
      defaultVersion: 'v1.0.0',
      pathTransform: (path: string) => path.replace('@gnosis/contracts', 'contracts')
    },
    '@balancer': {
      name: 'Balancer',
      baseUrl: 'https://github.com/balancer-labs/balancer-v2-monorepo/blob',
      defaultVersion: 'v2.0.0',
      pathTransform: (path: string) => path.replace('@balancer/v2-contracts', 'pkg/vault/contracts')
    }
  };
  
  export const processContractSource = (source: string): string => {
    let processedSource = source;
  
    // 处理 SPDX 许可标识符
    if (!source.includes('SPDX-License-Identifier')) {
      processedSource = '// SPDX-License-Identifier: MIT\n' + processedSource;
    }
  
    // 确保有 Solidity 版本声明
    if (!source.includes('pragma solidity')) {
      processedSource = 'pragma solidity ^0.8.0;\n' + processedSource;
    }
  
    // 处理导入语句
    const importRegex = /import\s+{([^}]+)}\s+from\s+["']([^"']+)["'];?|import\s+["']([^"']+)["'];?/g;
    let match;
    
    while ((match = importRegex.exec(source)) !== null) {
      let importPath = match[2] || match[3];
      let imports = match[1]?.split(',').map(i => i.trim()) || [];
      
      // 查找匹配的合约库
      const library = Object.entries(CONTRACT_LIBRARIES).find(([key]) => importPath.startsWith(key));
      
      if (library) {
        const [libraryKey, libraryInfo] = library;
        let newPath = importPath;
        
        // 转换路径
        if (libraryInfo.pathTransform) {
          newPath = libraryInfo.pathTransform(importPath);
        }
        
        // 构建完整的 GitHub URL
        const fullUrl = `${libraryInfo.baseUrl}/${libraryInfo.defaultVersion}/${newPath}`;
        
        // 替换导入语句
        let newImport;
        if (imports.length > 0) {
          newImport = `import { ${imports.join(', ')} } from "${fullUrl}";`;
        } else {
          newImport = `import "${fullUrl}";`;
        }
        
        processedSource = processedSource.replace(match[0], newImport);
      }
    }
  
    return processedSource;
  };
  
  export const validateContractImports = async (source: string): Promise<boolean> => {
    const importRegex = /import\s+{([^}]+)}\s+from\s+["']([^"']+)["'];?|import\s+["']([^"']+)["'];?/g;
    let match;
    const imports: ContractImport[] = [];
  
    while ((match = importRegex.exec(source)) !== null) {
      const importPath = match[2] || match[3];
      
      // 检查是否是支持的合约库
      const library = Object.entries(CONTRACT_LIBRARIES).find(([key]) => importPath.startsWith(key));
      
      if (!library) {
        console.warn(`Unsupported contract library in import: ${importPath}`);
        continue;
      }
  
      imports.push({
        path: importPath,
        version: library[1].defaultVersion
      });
    }
  
    // 验证所有导入
    try {
      await Promise.all(imports.map(async (imp) => {
        const library = Object.entries(CONTRACT_LIBRARIES).find(([key]) => imp.path.startsWith(key));
        if (!library) return;
  
        const [, libraryInfo] = library;
        const transformedPath = libraryInfo.pathTransform ? libraryInfo.pathTransform(imp.path) : imp.path;
        const fullUrl = `${libraryInfo.baseUrl}/${imp.version}/${transformedPath}`;
  
        // 这里可以添加实际的验证逻辑，比如检查文件是否存在
        // 为了示例，我们只返回 true
        return true;
      }));
      return true;
    } catch (error) {
      console.error('Error validating contract imports:', error);
      return false;
    }
  };
  
  export const getContractDependencies = (source: string): string[] => {
    const dependencies: string[] = [];
    const importRegex = /import\s+{([^}]+)}\s+from\s+["']([^"']+)["'];?|import\s+["']([^"']+)["'];?/g;
    let match;
  
    while ((match = importRegex.exec(source)) !== null) {
      const importPath = match[2] || match[3];
      const library = Object.entries(CONTRACT_LIBRARIES).find(([key]) => importPath.startsWith(key));
      
      if (library) {
        dependencies.push(library[0]);
      }
    }
  
    return [...new Set(dependencies)];
  };
  
  export const injectContractHelpers = (source: string): string => {
    // 注入常用的合约助手函数
    const helpers = `
      // Helper Functions
      function _msgSender() internal view returns (address) {
          return msg.sender;
      }
  
      function _msgValue() internal view returns (uint256) {
          return msg.value;
      }
  
      function _msgData() internal view returns (bytes calldata) {
          return msg.data;
      }
    `;
  
    // 在合约声明后注入助手函数
    const contractMatch = source.match(/contract\s+\w+/);
    if (contractMatch) {
      const insertPosition = source.indexOf(contractMatch[0]) + contractMatch[0].length;
      return source.slice(0, insertPosition) + ' {\n' + helpers + source.slice(insertPosition);
    }
  
    return source;
  };
  
  export const getRequiredLibraries = (source: string): string[] => {
    const libraries: string[] = [];
    
    // 检查是否使用了特定的库合约功能
    if (source.includes('SafeMath') || source.includes('using SafeMath')) {
      libraries.push('@openzeppelin/contracts/utils/math/SafeMath.sol');
    }
    if (source.includes('Ownable') || source.includes('is Ownable')) {
      libraries.push('@openzeppelin/contracts/access/Ownable.sol');
    }
    if (source.includes('ERC20') || source.includes('is ERC20')) {
      libraries.push('@openzeppelin/contracts/token/ERC20/ERC20.sol');
    }
    if (source.includes('ERC721') || source.includes('is ERC721')) {
      libraries.push('@openzeppelin/contracts/token/ERC721/ERC721.sol');
    }
    if (source.includes('ReentrancyGuard') || source.includes('is ReentrancyGuard')) {
      libraries.push('@openzeppelin/contracts/security/ReentrancyGuard.sol');
    }
  
    return [...new Set(libraries)];
  };
  