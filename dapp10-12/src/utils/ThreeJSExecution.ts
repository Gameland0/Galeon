// export const executeThreeJSCode = (code: string): string => {
//   const setupCode = `
//     const scene = new THREE.Scene();
//     const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
//     const renderer = new THREE.WebGLRenderer({ canvas: canvas });
//     renderer.setSize(canvas.clientWidth, canvas.clientHeight);
//     camera.position.z = 5;

//     function animate() {
//       requestAnimationFrame(animate);
//       renderer.render(scene, camera);
//     }
//     animate();
//   `;

//   return `
//     ${setupCode}
//     try {
//       ${code}
//     } catch (error) {
//       console.error('Error in user code:', error);
//       throw error;
//     }
//   `;
// };

export const executeThreeJSCode = (code: string): string => {

  const fullCode = `
    ${code}
  `;

  return fullCode;
};
