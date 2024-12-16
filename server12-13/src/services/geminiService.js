// const { GoogleGenerativeAI } = require("@google/generative-ai");
const { VertexAI } = require('@google-cloud/vertexai');
class GeminiService {
  constructor() {
    // this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    this.genAI = new VertexAI({project: 'gameland-424002', location: 'us-central1'});
  }
  async generateContent(msg, model) {
    const vertexAI = new VertexAI({project: 'gameland-424002', location: 'us-central1'});
  
    const generativeModel = vertexAI.getGenerativeModel({
      model: model,
    });
    const resp = await generativeModel.generateContent(msg);
    const contentResponse = await resp.response;
    return contentResponse.candidates[0].content.parts[0].text
  }
}

module.exports = new GeminiService();

  // const generateContents = async (msg) => {
  //   const vertexAI = new VertexAI({project: 'gameland-424002', location: 'us-central1'});
  
  //   const generativeModel = vertexAI.getGenerativeModel({
  //     model: 'gemini-1.5-flash-001',
  //   });
  //   const resp = await generativeModel.generateContent(msg);
  //   const contentResponse = await resp.response;
  //   return contentResponse.candidates[0].content.parts[0].text
  // }

// module.exports = generateContents