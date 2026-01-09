/**
 * TwitterAPI.io 服务
 * 封装 TwitterAPI.io 的 API 调用
 */

const axios = require('axios');
require('dotenv').config();

class TwitterAPIService {
  constructor() {
    this.apiKey = process.env.TWITTERAPI_KEY || 'new1_483e46d5840c4b5399d4fc9af1314a32';
    this.baseUrl = 'https://api.twitterapi.io';

    console.log('✅ TwitterAPIService initialized');
  }

  /**
   * 获取用户最新推文
   * @param {string} userName - 用户名 (不含@)
   * @param {number} count - 获取数量 (默认 20)
   * @returns {Promise<Array>} - 推文数组
   */
  async getUserTweets(userName, count = 20) {
    try {
      const url = `${this.baseUrl}/twitter/user/last_tweets`;

      const response = await axios.get(url, {
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        params: {
          userName: userName,
          count: count
        },
        timeout: 15000
      });

      if (response.data && response.data.data && response.data.data.tweets) {
        return response.data.data.tweets;
      }

      console.warn('⚠️ TwitterAPI.io 返回数据格式异常');
      return [];

    } catch (error) {
      console.error('❌ TwitterAPI.io 请求失败:', error.message);
      if (error.response) {
        console.error('   响应状态:', error.response.status);
        console.error('   响应数据:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * 转换 TwitterAPI.io 推文格式为统一格式
   * @param {Object} tweet - TwitterAPI.io 推文对象
   * @returns {Object} - 统一格式的推文对象
   */
  normalizeTweet(tweet) {
    return {
      id: tweet.id,
      content: tweet.text || '',
      url: tweet.url || tweet.twitterUrl,
      pubDate: tweet.createdAt,
      description: tweet.text || '',
      likes: tweet.likeCount || 0,
      retweets: tweet.retweetCount || 0,
      replies: tweet.replyCount || 0,
      views: tweet.viewCount || 0,
      author: tweet.author ? {
        userName: tweet.author.userName,
        name: tweet.author.name,
        followers: tweet.author.followers
      } : null
    };
  }
}

module.exports = new TwitterAPIService();
