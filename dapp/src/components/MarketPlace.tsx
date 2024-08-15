import React, { useState, useEffect } from 'react';
import axios from 'axios';

const MarketPlace: React.FC = () => {
  const [listings, setListings] = useState<Array<{ id: string, agent_id: string, price: string }>>([]);

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    try {
      const response = await axios.get('/api/market/listings');
      setListings(response.data);
    } catch (error) {
      console.error('Error fetching listings:', error);
    }
  };

  return (
    <div>
      <h2>Market Place</h2>
      <ul>
        {listings.map((listing) => (
          <li key={listing.id}>
            Agent ID: {listing.agent_id}, Price: {listing.price} ETH
          </li>
        ))}
      </ul>
    </div>
  );
};

export default MarketPlace;
