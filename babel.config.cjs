// Jest runs on CommonJS, so Babel turns the import/export in this project into require()
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};
