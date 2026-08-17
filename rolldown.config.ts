import {defineConfig} from 'rolldown';
import {dts} from 'rolldown-plugin-dts';

export default defineConfig({
    input: 'src/index.ts',
    // Runtime dependencies stay external so consumers dedupe them
    external: ['bitwise'],
    plugins: [dts()],
    output: {
        dir: 'dist',
        format: 'es',
        sourcemap: true
    }
});
