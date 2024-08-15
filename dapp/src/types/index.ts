export interface User {
    id: string;
    address: string;
  }
  
  export interface Agent {
    id: string;
    name: string;
    description: string;
    metadata: string;
  }
  
  export interface Message {
    user_message: string;
    ai_response: string;
  }
  