// electron/ipc/arithmetic.js
const { computeArithmetic } = require('../arithmetic-core');

function register(ipcMain) {
  ipcMain.on('arithmetic', (event, arg) => {
    const out = computeArithmetic(arg && arg.parameter);
    event.reply('showResult', out);
  });
}

module.exports = { register };
