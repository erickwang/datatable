import json from 'rollup-plugin-json';
import uglify from 'rollup-plugin-uglify-es';
import nodeResolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import postcss from 'rollup-plugin-postcss';
import nested from 'postcss-nested';
import cssnext from 'postcss-cssnext';
import eslint from 'rollup-plugin-eslint';
import merge from 'deepmerge';

const production = process.argv[3] === '--production';

const baseJS = {
    input: 'src/index.js',
    output: {
        file: '',
        globals: {
            sortablejs: 'Sortable',
            'clusterize.js': 'Clusterize'
        }
    },
    plugins: [
        json(),
        eslint({
            exclude: '**/*.json'
        }),
        nodeResolve(),
        commonjs()
    ],
    external: ['sortablejs', 'clusterize.js']
};

const baseCSS = {
    input: 'src/style.css',
    output: {
        file: ''
    },
    plugins: [
        postcss({
            extract: true,
            minimize: production,
            plugins: [
                nested(),
                cssnext()
            ]
        })
    ]
};

const devIIFE = merge(baseJS, {
    output: {
        file: 'dist/frappe-datatable.js',
        format: 'iife',
        name: 'DataTable'
    }
});

const devCjs = merge(baseJS, {
    output: {
        file: 'dist/frappe-datatable.cjs.js',
        format: 'cjs'
    }
});

const devCSS = merge(baseCSS, {
    output: {
        file: 'dist/frappe-datatable.css',
        format: 'cjs'
    }
});

// production
const prodIIFE = merge(devIIFE, {
    output: {
        file: 'dist/frappe-datatable.min.js'
    },
    plugins: [
        uglify()
    ]
});

const prodCSS = merge(devCSS, {
    output: {
        file: 'dist/frappe-datatable.min.css'
    }
});

// docs
const docJS = merge(devIIFE, {
    output: {
        file: 'docs/assets/js/frappe-datatable.js'
    }
});

const docCSS = merge(devCSS, {
    output: {
        file: 'docs/assets/css/frappe-datatable.css'
    }
});

const developmentAssets = [devIIFE, devCjs, devCSS];
const documentationAssets = [docJS, docCSS];
const productionAssets = [prodIIFE, prodCSS];

const docs = process.argv[3] === '--docs';
const assets = docs ? documentationAssets : production ? productionAssets : developmentAssets;

export default assets;
