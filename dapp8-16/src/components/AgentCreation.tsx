import React, { useState } from 'react';
import axios from 'axios';
import { httpapi } from '../services/api';

const AgentCreation: React.FC = () => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await httpapi.post('/api/agents', { name, description }, {
        headers: { 'x-access-token': localStorage.getItem('token') }
      });
      console.log('Agent created:', response.data);
      // Reset form or redirect
    } catch (error) {
      console.error('Error creating agent:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Agent Name"
        required
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Agent Description"
        required
      />
      <button type="submit">Create Agent</button>
    </form>
  );
};

export default AgentCreation;
