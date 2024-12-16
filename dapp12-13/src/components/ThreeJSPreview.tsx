import React, { useEffect, useRef } from 'react';
import '../styles/ThreeJSPreview.css';


const ThreeJSPreview: React.FC<{ code: string }> = ({ code }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
  
    useEffect(() => {
      if (iframeRef.current) {
        const iframe = iframeRef.current;
        iframe.srcdoc = `
          <html>
            <head>
              <style>
                body { margin: 0; }
                canvas { width: 100%; height: 100%; display: block; }
              </style>
            </head>
            <body>
              <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
              <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r150/three.min.js"></script>
              <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r150/examples/jsm/controls/OrbitControls.min.js"></script>
              <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r150/examples/jsm/loaders/GLTFLoader.min.js"></script>
              <script src="https://threejs.org/examples/js/loaders/GLTFLoader.js"></script>
              <script src="https://cdnjs.cloudflare.com/ajax/libs/tween.js/18.6.4/tween.umd.min.js"></script>
              <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r150/examples/jsm/loaders/ColladaLoader.min.js"></script>
              <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
              <script>
                  ${code}
              </script>
            </body>
          </html>
        `;
      }
    }, [code]);
  
    return (
      <div className="three-js-preview">
        <iframe
          ref={iframeRef}
          title="Three.js Preview"
          className="preview-iframe"
        />
      </div>
    );
  };
  
  export default ThreeJSPreview;
  
  

