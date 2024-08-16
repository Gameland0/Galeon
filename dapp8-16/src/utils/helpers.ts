export const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };
  
  export const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };
  