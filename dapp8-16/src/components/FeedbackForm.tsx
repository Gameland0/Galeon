import React, { useState } from 'react';
import axios from 'axios';

const FeedbackForm: React.FC<{ agentId: string }> = ({ agentId }) => {
  const [feedback, setFeedback] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/feedback', { agentId, feedback }, {
        headers: { 'x-access-token': localStorage.getItem('token') }
      });
      console.log('Feedback submitted:', response.data);
      setFeedback('');
      // Handle success (e.g., show a success message)
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Enter your feedback"
        required
      />
      <button type="submit">Submit Feedback</button>
    </form>
  );
};

export default FeedbackForm;
