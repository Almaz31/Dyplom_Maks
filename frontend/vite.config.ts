import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
 plugins: [react()],
 server: {proxy: {'/api': 'http://127.0.0.1:8001'}},
 build: {rollupOptions: {output: {manualChunks(id){
  if(!id.includes('/node_modules/'))return;
  if(/\/(react|react-dom|scheduler)\//.test(id))return 'react-vendor';
  if(id.includes('/leaflet/'))return 'maps-vendor';
  if(/\/(recharts|victory-vendor|d3-[^/]+|lodash[^/]*|decimal\.js-light|immer|react-smooth)\//.test(id))return 'charts-vendor';
 }}}},
});
