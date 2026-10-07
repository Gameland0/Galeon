import React, { useContext, useEffect, useState } from 'react';
import { Card, Row, Col, Input, Select, Pagination, Button, Tag, Spin, Empty, Divider, Tooltip, Badge, message } from 'antd';
import { ShoppingOutlined, SearchOutlined, FilterOutlined, PlayCircleOutlined, StarOutlined, CrownOutlined, UserOutlined } from '@ant-design/icons';
import { gameService, GameType } from '../services/gameService';
import { useNavigate } from 'react-router-dom';
import '../styles/GameMarketplace.css';
import { Web3Context } from '../contexts/Web3Context';
import { getGameSourceCode } from '../services/api';
import GamePlayer from './GamePlayer';

const { Search } = Input;
const { Option } = Select;

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
}

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

// Helper to map API game shape to UI Game interface
const mapApiGameToUIGame = (g: any) => ({
  // id may come from 'id', 'game_id', or 'fid'
  id: g.id ?? g.gameId ?? g.fid ?? '',
  title: g.title ?? '',
  description: g.description ?? '',
  category: g.category ?? '',
  thumbnailUrl: g.thumbnail_url ?? g.thumbnailUrl ?? '',
  price: typeof g.price === 'number' ? g.price : parseFloat(g.price) || 0,
  currency: g.currency ?? '',
  // tags may come as array or comma-separated string
  tags: Array.isArray(g.tags) ? g.tags : (typeof g.tags === 'string' ? g.tags.split(/[,;]+/).map((t: string) => t.trim()).filter(Boolean) : []),
  play_count: g.play_count ?? g.totalPlays ?? 0,
  rating: g.rating ?? undefined,
  blockchain_enabled: g.blockchain_enabled ?? g.blockchainEnabled ?? false,
  contract_address: g.contract_address ?? g.contractAddress,
  published_at: g.published_at ?? g.publishedAt ?? '',
  creator_id: g.creator_id ?? g.creatorId ?? ''
});

const GameMarketplace = () => {
  // 状态管理
  const [games, setGames] = useState([] as Game[]);
  const [loading, setLoading] = useState(true);
  const [totalGames, setTotalGames] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('');
  const [gameType, setGameType] = useState('');
  const [sortBy, setSortBy] = useState('published_at');
  const { account } = useContext(Web3Context);
  // 🎮 使用GamePlayer组件相关状态
  const [gamePlayerVisible, setGamePlayerVisible] = useState(false);
  const [currentGame, setCurrentGame] = useState<any>(null);
  const [gameFiles, setGameFiles] = useState<any[]>([]);
  // 维护每个游戏的统计数据，如唯一玩家数和评分
  const [statsMap, setStatsMap] = useState<Record<string, any>>({});
  const navigate = useNavigate();

  // 初始加载和筛选变化时加载游戏
  useEffect(() => {
    fetchGames();
  }, [currentPage, pageSize, category, gameType, sortBy]);



  // 获取游戏列表
  const fetchGames = async () => {
    setLoading(true);
    try {
      const filter: any = {
        page: currentPage,
        limit: pageSize
      };

      // 添加筛选条件
      if (category) filter.category = category;
      if (gameType) filter.gameType = gameType as GameType;
      if (searchQuery) filter.search = searchQuery;
      if (sortBy) filter.sortBy = sortBy;

      console.log("Calling getGamesFromMarket with filter:", filter);
      const response = await gameService.getGamesFromMarket(filter);
      console.log("getGamesFromMarket response:", response);

      // 检查响应格式并处理
      if (Array.isArray(response)) {
        console.log("Response is an array, expected object format. Adapting data...");
        // Normalize each game object
        const normalized = response.map(mapApiGameToUIGame);
        setGames(normalized);
        setTotalGames(normalized.length);
        // 同步获取每个游戏的统计数据
        try {
          const statsArray = await Promise.all(normalized.map(g => gameService.getGameStats(g.id)));
          const newMap: Record<string, any> = {};
          normalized.forEach((g, idx) => { newMap[g.id] = statsArray[idx]; });
          setStatsMap(newMap);
        } catch (statErr) {
          console.error('Failed to fetch game stats for marketplace:', statErr);
        }
      } else if (response && response.games) {
        console.log(`Response contains ${response.games.length} games with pagination:`, response.pagination);
        // Normalize each game object in paginated response
        const normalized = response.games.map(mapApiGameToUIGame);
        setGames(normalized);
        setTotalGames(response.pagination?.total || 0);
        // 同步获取每个游戏的统计数据
        try {
          const statsArray = await Promise.all(normalized.map(g => gameService.getGameStats(g.id)));
          const newMap: Record<string, any> = {};
          normalized.forEach((g, idx) => { newMap[g.id] = statsArray[idx]; });
          setStatsMap(newMap);
        } catch (statErr) {
          console.error('Failed to fetch game stats for marketplace:', statErr);
        }
      } else {
        console.error("Unexpected response format:", response);
        setGames([]);
        setTotalGames(0);
      }
    } catch (error) {
      console.error('Failed to fetch games:', error);
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  // 搜索处理
  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1); // 重置到第一页
    fetchGames();
  };

  // 分类变化处理
  const handleCategoryChange = (value: string) => {
    setCategory(value);
    setCurrentPage(1);
  };

  // 游戏类型变化处理
  const handleGameTypeChange = (value: string) => {
    setGameType(value);
    setCurrentPage(1);
  };

  // 排序方式变化处理
  const handleSortChange = (value: string) => {
    setSortBy(value);
    setCurrentPage(1);
  };

  // 分页变化处理
  const handlePageChange = (page: number, pageSize?: number) => {
    setCurrentPage(page);
    if (pageSize) setPageSize(pageSize);
  };

  // 游戏卡片渲染
  const renderGameCard = (game: Game) => {
    // 默认缩略图
    // 使用内嵌Base64图像替代外部依赖，避免网络请求失败
    const defaultThumbnail = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iI2VlZWVlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIGZpbGw9IiM5OTk5OTkiPkdhbWUgUHJldmlldzwvdGV4dD48L3N2Zz4=';

    // 从 statsMap 中获取统一的玩家数和评分
    const stats = statsMap[game.id] || {};

    // 安全处理标题和描述
    const safeTitle = game.title?.trim() || 'Untitled Game';
    const rawDesc = game.description?.replace(/undefined/g, '').trim() || '';
    const safeDesc = rawDesc ? `${rawDesc.substring(0, 80)}${rawDesc.length > 80 ? '...' : ''}` : 'No description available.';

    // 前往游戏详情页
    const goToGameDetails = () => {
      navigate(game.id ? `/game/${game.id}` : '/game-marketplace');
      };

    // 播放游戏
    const playGame = async () => {
      if (!game || !game.id) return;
      
      try {
        // 增加游戏播放次数，并传入玩家地址
        await gameService.incrementPlayCount(game.id, account);
        
        // 🔧 修复：用户已通过钱包登录，无需额外钱包连接检查
        // 只有涉及NFT铸造、代币交易等真正需要区块链交互的游戏才需要检查钱包
        // 普通的区块链游戏（如链上积分记录）不应阻止已登录用户游玩
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
        const response = await getGameSourceCode(game.id);
        // 准备游戏文件数据
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
      } catch (error) {
        console.error('Failed to start game:', error);
      }
    };

    return (
      <Col xs={24} sm={12} md={8} lg={6} key={game.id}>
        <Card
          hoverable
          className="game-card"
          cover={
            <div className="game-thumbnail">
              <img 
                alt={game.title} 
                src={game.thumbnailUrl || defaultThumbnail} 
                onError={(e: any) => { (e.currentTarget as HTMLImageElement).src = defaultThumbnail; }}
              />
              {game.blockchain_enabled && (
                <Tooltip title="Blockchain Enabled">
                  <Badge className="blockchain-badge" count={<CrownOutlined style={{ color: '#f9ca24' }} />} />
                </Tooltip>
              )}
              {game.price > 0 ? (
                <div className="game-price">
                  {game.price} {game.currency}
                </div>
              ) : (
                <div className="game-price free">FREE</div>
              )}
            </div>
          }
          actions={[
            <Tooltip key={`play-tooltip-${game.id}`} title="Play Game">
              {/* <Button type="primary" icon={<PlayCircleOutlined />} onClick={playGame}>
                Play
              </Button> */}
              <Button
                type="primary" 
                icon={<PlayCircleOutlined />} 
                onClick={playGame}
                className="playbutton"
              >
                Play
              </Button>
            </Tooltip>,
            <Tooltip key={`details-tooltip-${game.id}`} title="View Details">
              <Button icon={<SearchOutlined />} onClick={goToGameDetails}>
                Details
              </Button>
            </Tooltip>
          ]}
        >
          <Card.Meta
            title={safeTitle}
            description={
              <div>
                <div className="game-description">{safeDesc}</div>
                <div className="game-stats">
                  <Tooltip title="Players">
                    <span><UserOutlined /> {stats.players_count ?? 0}</span>
                  </Tooltip>
                  {stats.rating != null && !isNaN(Number(stats.rating)) && (
                    <Tooltip title="Rating">
                      <span><StarOutlined /> {Number(stats.rating).toFixed(1)}</span>
                    </Tooltip>
                  )}
                </div>
                <div className="game-tags">
                  {Array.isArray(game.tags) && game.tags
                    .filter(tag => tag?.trim())
                    .slice(0, 3)
                    .map((tag, index) => (
                      <Tag key={`tag-${tag.trim()}-${index}`} color="blue">{tag}</Tag>
                    ))
                  }
                  {game.category && <Tag color="green">{game.category}</Tag>}
                </div>
                <div className="game-date">
                  Published: {new Date(game.published_at).toLocaleDateString()}
                </div>
              </div>
            }
          />
        </Card>
      </Col>
    );
  };

  // GamePlayer事件处理
  const handleGamePlayerClose = () => {
    setGamePlayerVisible(false);
    setCurrentGame(null);
    setGameFiles([]);
  };

  const handleGameEnd = (score: number) => {
    console.log('🎮 游戏结束，得分:', score);
    // 可以在这里添加分数保存逻辑
  };

  return (
    <div className="game-marketplace">
      <div className="marketplace-header">
        <h1><ShoppingOutlined /> Game Marketplace</h1>
        <p>Discover and play amazing games created by the community</p>
      </div>

      <div className="marketplace-filters">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={10}>
            <Search
              placeholder="Search games..."
              allowClear
              enterButton
              onSearch={handleSearch}
              className="search-input"
            />
          </Col>
          <Col xs={24} md={14}>
            <Row gutter={8}>
              <Col xs={24} sm={8}>
                <Select
                  placeholder="Category"
                  style={{ width: '100%' }}
                  onChange={handleCategoryChange}
                  allowClear
                >
                  <Option key="cat-action" value="Action">Action</Option>
                  <Option key="cat-arcade" value="Arcade">Arcade</Option>
                  <Option key="cat-puzzle" value="Puzzle">Puzzle</Option>
                  <Option key="cat-strategy" value="Strategy">Strategy</Option>
                  <Option key="cat-edu" value="Educational">Educational</Option>
                  <Option key="cat-blockchain" value="Blockchain">Blockchain</Option>
                </Select>
              </Col>
              <Col xs={24} sm={8}>
                <Select
                  placeholder="Game Type"
                  style={{ width: '100%' }}
                  onChange={handleGameTypeChange}
                  allowClear
                >
                  <Option key="type-simple" value="simple">Simple</Option>
                  <Option key="type-score" value="score">Score-based</Option>
                  <Option key="type-nft" value="nft">NFT-based</Option>
                  <Option key="type-token" value="token">Token-based</Option>
                  <Option key="type-chain" value="fullChain">Full Blockchain</Option>
                </Select>
              </Col>
              <Col xs={24} sm={8}>
                <Select
                  placeholder="Sort By"
                  style={{ width: '100%' }}
                  defaultValue="published_at"
                  onChange={handleSortChange}
                >
                  <Option key="sort-new" value="published_at">Newest</Option>
                  <Option key="sort-play" value="play_count">Most Played</Option>
                  <Option key="sort-rate" value="rating">Top Rated</Option>
                  <Option key="sort-price" value="price">Price</Option>
                </Select>
              </Col>
            </Row>
          </Col>
        </Row>
      </div>

      <Divider orientation="left">
        <FilterOutlined /> {totalGames} Games Available
      </Divider>

      <div className="games-grid">
        {loading ? (
          <div className="loading-container">
            <Spin size="large" />
            <p>Loading games...</p>
          </div>
        ) : games.length > 0 ? (
          <Row gutter={[16, 16]}>
            {games.map((game: Game) => renderGameCard(game))}
          </Row>
        ) : (
          <Empty
            description="No games found. Try different search criteria or create your own game!"
            className="empty-state"
          />
        )}
      </div>

      {totalGames > 0 && (
        <div className="pagination-container">
          <Pagination
            current={currentPage}
            pageSize={pageSize}
            total={totalGames}
            onChange={handlePageChange}
            showSizeChanger
            showQuickJumper
            showTotal={(total: number) => `Total ${total} games`}
          />
        </div>
      )}

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
    </div>
  );
};

export default GameMarketplace; 