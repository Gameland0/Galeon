// Module declarations for missing types

declare module 'react';
declare module 'react-dom';
declare module 'react-router-dom';
declare module 'antd';
declare module '@ant-design/icons';
// Add runtime modules for JSX
declare module 'react/jsx-runtime';
declare module 'react/jsx-dev-runtime';

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
} 