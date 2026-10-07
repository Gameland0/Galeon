import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, useNavigate, Params } from 'react-router-dom';
import { Card, Row, Col, Button, Tag, Spin, Divider, Statistic, Tabs, Typography, Image, Tooltip, Modal, message, Collapse, Alert, Rate, Table } from 'antd';
import { 
  PlayCircleOutlined, 
  ArrowLeftOutlined, 
  StarOutlined, 
  UserOutlined,
  CalendarOutlined,
  TagOutlined,
  DollarOutlined,
  CrownOutlined,
  CodeOutlined,
  InfoCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  LinkOutlined
} from '@ant-design/icons';
import { gameService, GameType } from '../services/gameService';
import { getGameSourceCode } from '../services/api';
import { Web3Context } from '../contexts/Web3Context';
import GamePlayer from './GamePlayer';
import '../styles/GameDetail.css';

const { TabPane } = Tabs;
const { Title, Paragraph, Text } = Typography;
const { Panel } = Collapse;

// 游戏接口定义
interface Game {
  id: string;
  title: string;
  description: string;
  category: string;
  thumbnailUrl?: string;
  price: number;
  currency: string;
  tags: string[];
  play_count: number;
  rating?: number;
  blockchain_enabled: boolean;
  contract_address?: string;
  published_at: string;
  creator_id: string;
  gameType?: GameType;
  instructions?: string;
  sourceCodeType?: string;
  contract_abi?: any[];
}

interface GameSourceCode {
  sourceCode?: string;
  files?: Array<{
    name: string;
    content: string;
    type: string;
  }>;
}

// 玩家记录类型定义
interface PlayerRecord {
  key: number;
  date: string;
  address: string;
  score: number;
}

const isValidTag = (tag: unknown): tag is string => {
  return Boolean(tag && typeof tag === 'string' && tag.trim());
};

const GameDetail = () => {
  const params = useParams();
  const gameId = params.gameId;
  const navigate = useNavigate();
  const { account, web3 } = useContext(Web3Context);
  
  const initialGame: Game = {
    id: '',
    title: '',
    description: '',
    category: '',
    price: 0,
    currency: '',
    tags: [],
    play_count: 0,
    blockchain_enabled: false,
    published_at: '',
    creator_id: ''
  };
  
  const [game, setGame] = useState(initialGame);
  const [loading, setLoading] = useState(true);
  const [gameStats, setGameStats] = useState(null as any);
  const [sourceCodeLoading, setSourceCodeLoading] = useState(false);
  const [sourceCode, setSourceCode] = useState(null as GameSourceCode | null);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [currentScore, setCurrentScore] = useState(0);
  const [isGameEnded, setIsGameEnded] = useState(false);
  const [hasRated, setHasRated] = useState(false);
  // 玩家记录列表
  const [playerList, setPlayerList] = useState<PlayerRecord[]>([]);
  
  // 🎮 使用GamePlayer组件相关状态
  const [gamePlayerVisible, setGamePlayerVisible] = useState(false);
  const [currentGame, setCurrentGame] = useState<any>(null);
  const [gameFiles, setGameFiles] = useState<any[]>([]);

  useEffect(() => {
    if (typeof gameId === 'string' && gameId.trim()) {
      fetchGameDetails();
      fetchGameStats();
    } else {
      message.error('Invalid game ID');
      navigate('/game-marketplace');
    }
  }, [gameId]);

  useEffect(() => {
    if (gameStats?.rating_count && gameStats.rating_count > 0) {
      setHasRated(true);
    }
  }, [gameStats]);

  // 获取玩家记录（排行榜或所有提交记录）
  const fetchPlayerList = async () => {
    if (!gameId) return;
    try {
      const res = await gameService.getLeaderboard(gameId, 1000);
      const records: any[] = Array.isArray(res) ? res : res.entries ?? [];
      const mapped: PlayerRecord[] = records.map((r: any, idx: number) => ({
        key: idx,
        date: r.created_at || r.updated_at || '',
        address: r.player_address || r.playerAddress || r.address || '',
        score: r.score
      }));
      setPlayerList(mapped);
    } catch (error) {
      console.error('Failed to fetch player records:', error);
    }
  };

  useEffect(() => {
    if (typeof gameId === 'string' && gameId.trim()) {
      fetchPlayerList();
    }
  }, [gameId]);

  // 表格列定义
  const playerColumns = [
    { title: 'Date', dataIndex: 'date', key: 'date', render: (text: string) => text ? new Date(text).toLocaleString() : '' },
    { title: 'Address', dataIndex: 'address', key: 'address' },
    { title: 'Score', dataIndex: 'score', key: 'score' },
  ];



  // 获取游戏详情
  const fetchGameDetails = async () => {
    setLoading(true);
    try {
      if (typeof gameId !== 'string' || !gameId.trim()) {
        message.error('Invalid game ID');
        navigate('/game-marketplace');
        return;
      }
      
      // 使用getGameById方法获取游戏详情
      const response = await gameService.getGameById(gameId);
      
      if (response.game) {
        setGame(response.game);
      } else {
        console.error('Game not found');
        message.error('Game not found');
        setTimeout(() => navigate('/game-marketplace'), 1500);
      }
    } catch (error) {
      console.error('Failed to fetch game details:', error);
      message.error('Failed to load game details');
      setTimeout(() => navigate('/game-marketplace'), 1500);
    } finally {
      setLoading(false);
    }
  };

  // 获取游戏统计数据
  const fetchGameStats = async () => {
    if (!gameId) return;
    
    try {
      const stats = await gameService.getGameStats(gameId);
      setGameStats(stats);
    } catch (error) {
      console.error('Failed to fetch game stats:', error);
    }
  };


  // 返回游戏市场
  const goBackToMarketplace = () => {
    navigate('/game-marketplace');
  };

  // 播放游戏
  const playGame = async () => {
    if (!game || !gameId) return;
    
    try {
      // 增加游戏播放次数，并传入玩家地址
      await gameService.incrementPlayCount(gameId, account);
      
      // 🔧 修复：用户已通过钱包登录，无需额外钱包连接检查
      // 只有涉及NFT铸造、代币交易等真正需要区块链交互的游戏才需要检查钱包
      if (game.blockchain_enabled && !account) {
        // 仅在游戏包含交易功能时才提示连接钱包
        const requiresTransaction = game.tags?.some((tag: string) => 
          tag.toLowerCase().includes('nft') || 
          tag.toLowerCase().includes('token') || 
          tag.toLowerCase().includes('trade') ||
          tag.toLowerCase().includes('marketplace')
        );
        
        if (requiresTransaction) {
          message.warning('This game involves blockchain transactions. Please ensure your wallet is connected.');
          // 不阻止游戏启动，只是警告
        }
      }
      
      // 从后端加载源码文件
      const response = await getGameSourceCode(gameId);
      const files: any[] = [];
      
      if (response.files && response.files.length > 0) {
        response.files.forEach((file: any) => {
          files.push({
            name: file.name,
            content: file.content,
            type: file.type || 'text'
          });
        });
      } else if (response.sourceCode) {
        files.push({
          name: 'game.js',
          content: response.sourceCode,
          type: 'javascript'
        });
      }
      
      // 设置游戏数据并打开GamePlayer
      setCurrentGame(game);
      setGameFiles(files);
      setGamePlayerVisible(true);
      
      // 刷新统计数据
      fetchGameStats();
    } catch (error) {
      console.error('Failed to start game:', error);
      message.error('Failed to load game');
    }
  };

  // GamePlayer事件处理
  const handleGamePlayerClose = () => {
    setGamePlayerVisible(false);
    setCurrentGame(null);
    setGameFiles([]);
  };

  const handleGameEnd = (score: number) => {
    console.log('🎮 GameDetail: 游戏结束，得分:', score);
    setCurrentScore(score);
    setIsGameEnded(true);
    
    // 提交分数并刷新统计数据
    if (gameId) {
      (async () => {
        try {
          await gameService.submitScore(gameId as string, score, account);
          fetchGameStats();
        } catch (error) {
          console.error('Failed to submit score:', error);
        }
      })();
    }
  };

  // 查看游戏源码
  const viewSourceCode = async () => {
    if (!gameId) return;
    
    setSourceCodeLoading(true);
    try {
      const response = await getGameSourceCode(gameId);
      
      if (response && (response.sourceCode || response.files)) {
        setSourceCode({
          sourceCode: response.sourceCode,
          files: response.files
        });
        setSourceModalVisible(true);
      } else {
        message.error('Failed to load source code for this game');
      }
    } catch (error: any) {
      console.error('Failed to fetch source code:', error);
      message.error(`Failed to load source code: ${error.message || 'Unknown error'}`);
    } finally {
      setSourceCodeLoading(false);
    }
  };

  // 关闭源码模态窗口
  const closeSourceModal = () => {
    setSourceModalVisible(false);
  };

  // 下载游戏源码
  const downloadSourceCode = () => {
    if (!sourceCode || (!sourceCode.sourceCode && (!sourceCode.files || sourceCode.files.length === 0))) {
      message.error('No source code available to download');
      return;
    }
    
    try {
      if (sourceCode.files && sourceCode.files.length > 0) {
        // 如果有多个文件，创建一个zip
        // 这里简化处理，实际上需要使用JSZip这样的库来创建zip
        sourceCode.files.forEach((file: {name: string, content: string, type: string}) => {
          const blob = new Blob([file.content], { type: 'text/plain' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = file.name;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
        });
        message.success('Files downloaded successfully');
      } else if (sourceCode.sourceCode) {
        // 如果只有一个源码字符串，下载为单个文件
        const blob = new Blob([sourceCode.sourceCode], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'game-source.txt';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        message.success('Source code downloaded successfully');
      }
    } catch (error) {
      console.error('Download failed:', error);
      message.error('Failed to download source code');
    }
  };

  // Claim reward after game ends by invoking the smart contract endGame method
  const claimReward = async () => {
    if (!web3 || !account) {
      message.error('Web3 not initialized or wallet not connected');
      return;
    }
    if (!game.contract_address) {
      message.error('Contract address is missing');
      return;
    }
    if (!game.contract_abi || !Array.isArray(game.contract_abi)) {
      message.error('Contract ABI is missing or invalid');
      return;
    }
    try {
      const contract = new web3.eth.Contract(
        game.contract_abi as any,
        game.contract_address
      );
      await contract.methods.endGame(currentScore).send({ from: account });
      message.success('Reward claimed successfully!');
      setIsGameEnded(false);
      setCurrentScore(0);
    } catch (error: any) {
      message.error(`Failed to claim reward: ${error.message}`);
      console.error('Failed to claim reward:', error);
    }
  };

  // 游戏不存在时
  if (!loading && !game.id) {
    return (
      <div className="game-detail-container">
        <div className="game-not-found">
          <Title level={2}>Game Not Found</Title>
          <Paragraph>The game you are looking for does not exist or has been removed.</Paragraph>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={goBackToMarketplace}>
            Back to Marketplace
          </Button>
        </div>
      </div>
    );
  }

  // 加载状态
  if (loading) {
    return (
      <div className="game-detail-container">
        <div className="loading-container">
          <Spin size="large" />
          <p>Loading game details...</p>
        </div>
      </div>
    );
  }

  // 使用内嵌Base64图像替代外部依赖，避免网络请求失败
  const defaultThumbnail = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjM1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNjAwIiBoZWlnaHQ9IjM1MCIgZmlsbD0iI2VlZWVlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIGZpbGw9IiM5OTk5OTkiPkdhbWUgUHJldmlldzwvdGV4dD48L3N2Zz4=';

  return (
    <div className="game-detail-container">
      {/* 返回按钮 */}
      <Button 
        icon={<ArrowLeftOutlined />} 
        onClick={goBackToMarketplace}
        className="back-button"
      >
        Back to Marketplace
      </Button>

      {/* 游戏标题和基本信息 */}
      <div className="game-header">
        <Title level={2}>{game.title}</Title>
        <div className="game-meta">
          <Tag key="tag-date" color="blue" icon={<CalendarOutlined />}>
            {new Date(game.published_at || '').toLocaleDateString()}
          </Tag>
          <Tag key="tag-category" color="green" icon={<TagOutlined />}>
            {game.category}
          </Tag>
          {game.blockchain_enabled && (
            <Tag key="tag-blockchain" color="gold" icon={<CrownOutlined />}>
              Blockchain Enabled
            </Tag>
          )}
          <Tag key="tag-creator" color="purple" icon={<UserOutlined />}>
            Creator ID: {game.creator_id}
          </Tag>
          {game.contract_address && (
            <Tag key="tag-contract" color="magenta" icon={<LinkOutlined />}>
              Contract: {game.contract_address}
            </Tag>
          )}
          {game.sourceCodeType && (
            <Tag key="tag-source-type" color="cyan" icon={<CodeOutlined />}>
              {game.sourceCodeType}
            </Tag>
          )}
        </div>
      </div>

      {/* 游戏内容 */}
      <Row gutter={[24, 24]} className="game-content">
        {/* 左侧: 图片和操作按钮 */}
        <Col xs={24} md={12}>
          <Card className="game-image-card">
            <Image
              src={game.thumbnailUrl || defaultThumbnail}
              alt={game.title}
              className="game-image"
            />
            <div className="game-price-section">
              {game.price ? (
                <Tag key="price-paid" color="orange" icon={<DollarOutlined />} className="price-tag">
                  {game.price} {game.currency}
                </Tag>
              ) : (
                <Tag key="price-free" color="success" icon={<DollarOutlined />} className="price-tag">
                  FREE
                </Tag>
              )}
            </div>
            <div className="button-group">
              <Button
                key="play-game-button"
                type="primary" 
                icon={<PlayCircleOutlined />} 
                size="large"
                onClick={playGame}
                className="play-button"
                block
              >
                Play Game
              </Button>
              <Button
                key="view-source-button"
                icon={<EyeOutlined />}
                size="large"
                onClick={viewSourceCode}
                loading={sourceCodeLoading}
                className="source-button"
                block
              >
                View Source Code
              </Button>
            </div>
          </Card>

          {/* 游戏统计 */}
          <Card className="game-stats-card">
            <Row gutter={16}>
              <Col key="stat-plays" span={8}>
                <Statistic 
                  title="Plays" 
                  value={gameStats?.play_count ?? game.play_count ?? 0} 
                  prefix={<PlayCircleOutlined />} 
                />
              </Col>
              <Col key="stat-rating" span={8}>
                <Statistic
                  title="Your Rating"
                  valueRender={() => (
                    <Rate
                      allowHalf
                      value={gameStats?.rating ?? 0}
                      disabled={hasRated}
                      onChange={async (value: number) => {
                        if (!gameId || hasRated) return;
                        try {
                          await gameService.submitScore(gameId, value, account);
                          message.success('Rating submitted');
                          fetchGameStats();
                          setHasRated(true);
                        } catch (error) {
                          console.error('Failed to submit rating:', error);
                          message.error('Failed to submit rating');
                        }
                      }}
                    />
                  )}
                />
              </Col>
              <Col key="stat-players" span={8}>
                <Statistic 
                  title="Players" 
                  value={gameStats?.players_count ?? 0}
                  prefix={<UserOutlined />} 
                />
              </Col>
            </Row>
          </Card>
        </Col>

        {/* 右侧: 详细信息和选项卡 */}
        <Col xs={24} md={12}>
          <Card className="game-info-card">
            <Tabs defaultActiveKey="description">
              <TabPane tab="Description" key="description">
                <Paragraph>{game.description}</Paragraph>
                
                <Divider orientation="left">Tags</Divider>
                <div className="game-tags">
                  {Array.isArray(game.tags) && game.tags.length > 0 ? (
                    game.tags
                      .filter((tag: unknown): tag is string => Boolean(tag && typeof tag === 'string' && tag.trim()))
                      .map((tag: string, index: number) => (
                        <Tag key={`desc-tag-${String(tag)}-${index}`} color="blue">
                          {tag}
                        </Tag>
                      ))
                  ) : (
                    <Text type="secondary">No tags available</Text>
                  )}
                </div>
              </TabPane>
              
              <TabPane tab="How to Play" key="instructions">
                <Paragraph>
                  {game.instructions || 'No instructions provided for this game. Just jump in and start playing!'}
                </Paragraph>
              </TabPane>
              
              {game.blockchain_enabled && (
                <TabPane tab="Blockchain Info" key="blockchain">
                  <Paragraph>
                    <Text strong>Contract Address:</Text> {game.contract_address || 'Not specified'}
                  </Paragraph>
                  
                  <Tooltip title="This game integrates with blockchain technology. You may need a compatible wallet to access all features.">
                    <Paragraph>
                      <InfoCircleOutlined /> This game integrates with blockchain technology. You may need a wallet to access all features.
                    </Paragraph>
                  </Tooltip>
                  
                  {!account && (
                    <Paragraph type="warning">
                      You are not connected to a wallet. Some game features may be limited or unavailable.
                    </Paragraph>
                  )}
                </TabPane>
              )}
              <TabPane tab="Player Records" key="players">
                <Table
                  columns={playerColumns}
                  dataSource={playerList}
                  pagination={{ pageSize: 10 }}
                  style={{ marginTop: 16 }}
                />
              </TabPane>
            </Tabs>
          </Card>
        </Col>
      </Row>

      {/* 🎮 使用GamePlayer组件 */}
      <GamePlayer
        visible={gamePlayerVisible}
        onClose={handleGamePlayerClose}
        gameFiles={gameFiles}
        gameId={currentGame?.id}
        gameTitle={currentGame?.title}
        gameType={currentGame?.category}
        isVsGame={currentGame?.tags?.some((tag: string) => tag.toLowerCase().includes('ai') || tag.toLowerCase().includes('vs'))}
        onGameEnd={handleGameEnd}
      />

      {/* 源码模态窗口 */}
      <Modal
        title={game ? `${game.title} Source Code` : 'Source Code'}
        visible={sourceModalVisible}
        onCancel={closeSourceModal}
        footer={[
          <Button key="close-modal" onClick={closeSourceModal}>
            Close
          </Button>,
          <Button 
            key="download-source" 
            type="primary" 
            icon={<DownloadOutlined />} 
            onClick={downloadSourceCode}
          >
            Download
          </Button>
        ]}
        width={800}
        className="source-code-modal"
      >
        {sourceCodeLoading ? (
          <div className="loading-container">
            <Spin size="large" />
            <p>Loading source code...</p>
          </div>
        ) : sourceCode ? (
          <div className="source-code-container">
            {sourceCode.files && sourceCode.files.length > 0 ? (
              <Collapse defaultActiveKey={['0']}>
                {sourceCode.files.map((file: {name: string, content: string, type: string}, index: number) => (
                  <Panel header={file.name} key={`file-${file.name}-${index}`}>
                    <pre className="code-block">
                      <code>{file.content}</code>
                    </pre>
                  </Panel>
                ))}
              </Collapse>
            ) : sourceCode.sourceCode ? (
              <pre className="code-block">
                <code>{sourceCode.sourceCode}</code>
              </pre>
            ) : (
              <div className="no-source">
                <p>No source code available for this game.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="no-source">
            <p>No source code available for this game.</p>
          </div>
        )}
      </Modal>

      {isGameEnded && (
        <Alert
          message={`Game Ended! Score: ${currentScore}`}
          type="success"
          action={
            <Button type="primary" onClick={claimReward}>
              Claim Reward
            </Button>
          }
          style={{ marginTop: 16 }}
        />
      )}
    </div>
  );
};

export default GameDetail; 