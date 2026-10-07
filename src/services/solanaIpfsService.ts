import { create, IPFSHTTPClient } from 'ipfs-http-client';

// Solana IPFS集成服务
// 用于处理Agent配置、图片和训练数据的IPFS存储

export interface IpfsMetadata {
  contentHash: string;      // IPFS内容哈希 (Qm...)
  contentType: IpfsContentType; // 内容类型
  sizeBytes: number;        // 文件大小
  uploadedAt: number;       // 上传时间戳
}

export enum IpfsContentType {
  AGENT_CONFIG = 'agent_config',
  AGENT_IMAGE = 'agent_image',
  TRAINING_DATA = 'training_data',
  TEAM_METADATA = 'team_metadata',
}

export interface AgentConfig {
  name: string;
  description: string;
  type: string;
  version: string;
  capabilities: string[];
  created_at: number;
  metadata?: any;
}

export interface TrainingDataConfig {
  type: 'text' | 'url' | 'hyperlink';
  content: string;
  title?: string;
  description?: string;
  tags?: string[];
  created_at: number;
}

export interface TeamMetadata {
  name: string;
  description: string;
  agents: Array<{
    id: number;
    role: string;
  }>;
  created_at: number;
  updated_at: number;
}

export class SolanaIpfsService {
  private ipfsClient: IPFSHTTPClient;
  private readonly INFURA_PROJECT_ID: string;
  private readonly INFURA_PROJECT_SECRET: string;
  private readonly IPFS_API_URL: string = 'https://ipfs.infura.io:5001/api/v0';
  private readonly IPFS_GATEWAY_URL: string = 'https://ipfs.io/ipfs/';

  constructor(infuraProjectId?: string, infuraProjectSecret?: string) {
    // 从环境变量或参数获取Infura凭据
    this.INFURA_PROJECT_ID = infuraProjectId || process.env.REACT_APP_INFURA_PROJECT_ID || '';
    this.INFURA_PROJECT_SECRET = infuraProjectSecret || process.env.REACT_APP_INFURA_PROJECT_SECRET || '';

    if (!this.INFURA_PROJECT_ID || !this.INFURA_PROJECT_SECRET) {
      console.warn('IPFS服务未配置Infura凭据，将使用本地IPFS节点');
    }

    this.ipfsClient = create({
      host: 'ipfs.infura.io',
      port: 5001,
      protocol: 'https',
      headers: this.INFURA_PROJECT_ID ? {
        authorization: `Basic ${btoa(`${this.INFURA_PROJECT_ID}:${this.INFURA_PROJECT_SECRET}`)}`
      } : undefined
    });
  }

  // ===== Agent配置相关 =====

  /**
   * 上传Agent配置到IPFS
   */
  async uploadAgentConfig(agentData: AgentConfig): Promise<IpfsMetadata> {
    try {
      const configJson = JSON.stringify(agentData, null, 2);
      const result = await this.ipfsClient.add(configJson);
      
      console.log('Agent配置已上传到IPFS:', result.cid.toString());
      
      return {
        contentHash: result.cid.toString(),
        contentType: IpfsContentType.AGENT_CONFIG,
        sizeBytes: Buffer.byteLength(configJson, 'utf8'),
        uploadedAt: Math.floor(Date.now() / 1000)
      };
    } catch (error) {
      console.error('上传Agent配置到IPFS失败:', error);
      throw new Error(`Failed to upload agent config to IPFS: ${error.message}`);
    }
  }

  /**
   * 从IPFS获取Agent配置
   */
  async getAgentConfig(ipfsHash: string): Promise<AgentConfig> {
    try {
      const chunks = [];
      for await (const chunk of this.ipfsClient.cat(ipfsHash)) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks).toString();
      return JSON.parse(content) as AgentConfig;
    } catch (error) {
      console.error('从IPFS获取Agent配置失败:', error);
      throw new Error(`Failed to get agent config from IPFS: ${error.message}`);
    }
  }

  // ===== 图片相关 =====

  /**
   * 上传图片到IPFS
   */
  async uploadImage(imageFile: File): Promise<IpfsMetadata> {
    try {
      const result = await this.ipfsClient.add(imageFile);
      
      console.log('图片已上传到IPFS:', result.cid.toString());
      
      return {
        contentHash: result.cid.toString(),
        contentType: IpfsContentType.AGENT_IMAGE,
        sizeBytes: imageFile.size,
        uploadedAt: Math.floor(Date.now() / 1000)
      };
    } catch (error) {
      console.error('上传图片到IPFS失败:', error);
      throw new Error(`Failed to upload image to IPFS: ${error.message}`);
    }
  }

  /**
   * 从Blob上传图片到IPFS
   */
  async uploadImageBlob(imageBlob: Blob): Promise<IpfsMetadata> {
    try {
      const result = await this.ipfsClient.add(imageBlob);
      
      console.log('图片Blob已上传到IPFS:', result.cid.toString());
      
      return {
        contentHash: result.cid.toString(),
        contentType: IpfsContentType.AGENT_IMAGE,
        sizeBytes: imageBlob.size,
        uploadedAt: Math.floor(Date.now() / 1000)
      };
    } catch (error) {
      console.error('上传图片Blob到IPFS失败:', error);
      throw new Error(`Failed to upload image blob to IPFS: ${error.message}`);
    }
  }

  /**
   * 获取图片的IPFS URL
   */
  getImageUrl(ipfsHash: string): string {
    return `${this.IPFS_GATEWAY_URL}${ipfsHash}`;
  }

  // ===== 训练数据相关 =====

  /**
   * 上传训练数据到IPFS
   */
  async uploadTrainingData(trainingData: TrainingDataConfig): Promise<IpfsMetadata> {
    try {
      const dataJson = JSON.stringify(trainingData, null, 2);
      const result = await this.ipfsClient.add(dataJson);
      
      console.log('训练数据已上传到IPFS:', result.cid.toString());
      
      return {
        contentHash: result.cid.toString(),
        contentType: IpfsContentType.TRAINING_DATA,
        sizeBytes: Buffer.byteLength(dataJson, 'utf8'),
        uploadedAt: Math.floor(Date.now() / 1000)
      };
    } catch (error) {
      console.error('上传训练数据到IPFS失败:', error);
      throw new Error(`Failed to upload training data to IPFS: ${error.message}`);
    }
  }

  /**
   * 从IPFS获取训练数据
   */
  async getTrainingData(ipfsHash: string): Promise<TrainingDataConfig> {
    try {
      const chunks = [];
      for await (const chunk of this.ipfsClient.cat(ipfsHash)) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks).toString();
      return JSON.parse(content) as TrainingDataConfig;
    } catch (error) {
      console.error('从IPFS获取训练数据失败:', error);
      throw new Error(`Failed to get training data from IPFS: ${error.message}`);
    }
  }

  // ===== 团队元数据相关 =====

  /**
   * 上传团队元数据到IPFS
   */
  async uploadTeamMetadata(teamData: TeamMetadata): Promise<IpfsMetadata> {
    try {
      const metadataJson = JSON.stringify(teamData, null, 2);
      const result = await this.ipfsClient.add(metadataJson);
      
      console.log('团队元数据已上传到IPFS:', result.cid.toString());
      
      return {
        contentHash: result.cid.toString(),
        contentType: IpfsContentType.TEAM_METADATA,
        sizeBytes: Buffer.byteLength(metadataJson, 'utf8'),
        uploadedAt: Math.floor(Date.now() / 1000)
      };
    } catch (error) {
      console.error('上传团队元数据到IPFS失败:', error);
      throw new Error(`Failed to upload team metadata to IPFS: ${error.message}`);
    }
  }

  /**
   * 从IPFS获取团队元数据
   */
  async getTeamMetadata(ipfsHash: string): Promise<TeamMetadata> {
    try {
      const chunks = [];
      for await (const chunk of this.ipfsClient.cat(ipfsHash)) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks).toString();
      return JSON.parse(content) as TeamMetadata;
    } catch (error) {
      console.error('从IPFS获取团队元数据失败:', error);
      throw new Error(`Failed to get team metadata from IPFS: ${error.message}`);
    }
  }

  // ===== 通用方法 =====

  /**
   * 从IPFS获取原始内容
   */
  async getContent(ipfsHash: string): Promise<string> {
    try {
      const chunks = [];
      for await (const chunk of this.ipfsClient.cat(ipfsHash)) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString();
    } catch (error) {
      console.error('从IPFS获取内容失败:', error);
      throw new Error(`Failed to get content from IPFS: ${error.message}`);
    }
  }

  /**
   * 检查IPFS哈希是否存在且可访问
   */
  async verifyHash(ipfsHash: string): Promise<boolean> {
    try {
      const stat = await this.ipfsClient.object.stat(ipfsHash as any);
      return stat.Hash.toString() === ipfsHash;
    } catch (error) {
      console.warn('验证IPFS哈希失败:', error);
      return false;
    }
  }

  /**
   * 获取IPFS内容的统计信息
   */
  async getContentStats(ipfsHash: string): Promise<any> {
    try {
      return await this.ipfsClient.object.stat(ipfsHash as any);
    } catch (error) {
      console.error('获取IPFS内容统计失败:', error);
      throw new Error(`Failed to get content stats from IPFS: ${error.message}`);
    }
  }

  // ===== 批量操作 =====

  /**
   * 批量上传多个文件到IPFS
   */
  async uploadBatch(files: Array<{ name: string; content: string | Blob }>): Promise<IpfsMetadata[]> {
    try {
      const results: IpfsMetadata[] = [];
      
      for (const file of files) {
        const result = await this.ipfsClient.add({
          path: file.name,
          content: file.content
        });
        
        const sizeBytes = typeof file.content === 'string' 
          ? Buffer.byteLength(file.content, 'utf8')
          : file.content.size;

        results.push({
          contentHash: result.cid.toString(),
          contentType: this.inferContentType(file.name),
          sizeBytes,
          uploadedAt: Math.floor(Date.now() / 1000)
        });
      }
      
      console.log(`批量上传完成，共${results.length}个文件`);
      return results;
    } catch (error) {
      console.error('批量上传到IPFS失败:', error);
      throw new Error(`Failed to batch upload to IPFS: ${error.message}`);
    }
  }

  /**
   * 根据文件名推断内容类型
   */
  private inferContentType(filename: string): IpfsContentType {
    const ext = filename.split('.').pop()?.toLowerCase();
    
    switch (ext) {
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
        return IpfsContentType.AGENT_IMAGE;
      case 'json':
        if (filename.includes('config')) {
          return IpfsContentType.AGENT_CONFIG;
        } else if (filename.includes('team')) {
          return IpfsContentType.TEAM_METADATA;
        } else {
          return IpfsContentType.TRAINING_DATA;
        }
      default:
        return IpfsContentType.TRAINING_DATA;
    }
  }

  // ===== 缓存管理 =====

  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_DURATION = 15 * 60 * 1000; // 15分钟缓存

  /**
   * 带缓存的内容获取
   */
  async getCachedContent(ipfsHash: string): Promise<any> {
    const cached = this.cache.get(ipfsHash);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      console.log('从缓存获取IPFS内容:', ipfsHash);
      return cached.data;
    }

    try {
      const content = await this.getContent(ipfsHash);
      const data = JSON.parse(content);
      
      this.cache.set(ipfsHash, {
        data,
        timestamp: Date.now()
      });
      
      return data;
    } catch (error) {
      console.error('获取IPFS缓存内容失败:', error);
      throw error;
    }
  }

  /**
   * 清理过期缓存
   */
  clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_DURATION) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 清理所有缓存
   */
  clearAllCache(): void {
    this.cache.clear();
  }

  // ===== 工具方法 =====

  /**
   * 将文件转换为Base64
   */
  async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * 压缩图片
   */
  async compressImage(file: File, maxWidth: number = 800, quality: number = 0.8): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        const { width, height } = img;
        const ratio = Math.min(maxWidth / width, maxWidth / height);
        
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };

      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    }) as Promise<Blob>;
  }

  /**
   * 验证IPFS哈希格式
   */
  isValidIpfsHash(hash: string): boolean {
    return /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(hash) || 
           /^baf[a-z0-9]{56}$/.test(hash) ||
           /^bafy[a-z0-9]{56}$/.test(hash);
  }
}