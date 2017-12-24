class Token {
  constructor(expr = '') {
    const reg = /\s*([-+*\/%=\(\)]|[A-Za-z_][A-Za-z0-9_]*|[0-9]*\.?[0-9]+)\s*/g;
    this.tokens = String(expr).split(reg).filter(each => !each.match(/^\s*$/));
    this.idx = 0;
  }


  getToken() {
    if (this.idx > this.tokens.length) {
      throw new Error('Wrong Expression');
    }
    return this.tokens[this.idx++];
  }

  ungetToken() {
    this.idx--;
  }

  copy() {
    return this.tokens.slice(this.idx);
  }

  len() {
    return this.tokens.length - this.idx;
  }
}

class Interpreter {
  constructor() {
    this.vars = {};
    this.functions = {};
  }

  input(expr) {
    const tokens = new Token(expr);
    if (tokens.len() === 0) return '';
    const token = tokens.getToken();
    if (token === 'fn') {
      this.parseFunction(tokens);
      return '';
    }
    tokens.ungetToken();
    const v = this.parseExpression(tokens);
    if (tokens.len() !== 0) {
      throw new Error(`Error: Illegal Expression ${expr}`);
    }
    return v;
  }

  parseFunction(tokens) {
    const fn = tokens.getToken();
    if (this.vars[fn] !== undefined) {
      throw new Error(`Error: ${fn} is a variable`);
    }

    const params = [];
    const paramObj = {};

    let token = tokens.getToken();
    while (token !== '=') {
      if (paramObj[token] !== undefined) {
        throw new Error(`Error: params conflict ${token}`);
      }
      paramObj[token] = 1;
      params.push(token);
      token = tokens.getToken();
    }

    token = tokens.getToken();
    if (token !== '>') {
      throw new Error('Error: illegal fucntion definition');
    }

    const block = tokens.copy();
    if (block.length === 0) {
      throw new Error('Error: illegal functions definition');
    }

    for (let i = 0; i < block.length; i++) {
      token = block[i];
      if (/^[a-zA-Z]*$/.test(token)) {
        if (paramObj[token] === undefined) {
          throw new Error(`ERROR: Unknown identifier '${token}'`);
        }
      }
    }
    this.functions[fn] = {
      params,
      block
    };

    return;
  }
  // => = + - * / %
  // eg      1 + 2 * 3
  parseExpression(tokens, env = {}) {
    if (this.isAssignment(tokens)) {
      return this.parseAssignment(tokens);
    }

    let v1 = this.parseTerm(tokens, env); // 1

    if (/^[a-zA-Z]*$/.test(v1)) {
      throw new Error(`Error: Undefined variable '${v1}'`);
    }

    for (;;) {
      const token = tokens.getToken();
      if (token !== '-' && token !== '+') {
        tokens.ungetToken();
        break;
      }

      const v2 = this.parseTerm(tokens, env); // 2
      if (/^[a-zA-Z]*$/.test(v2)) {
        throw new Error(`Error: Undefined variable '${v2}'`);
      }
      if (token === '+') {
        v1 += v2;
      } else if (token === '-') {
        v1 -= v2;
      } else {
        tokens.ungetToken();
      }
    }

    return v1;
  }

  isAssignment(tokens) {
    if (tokens.len() <= 2) return false;
    const _ = tokens.getToken();
    const token = tokens.getToken();
    tokens.ungetToken();
    tokens.ungetToken();
    return token === '=';
  }

  parseAssignment(tokens) {
    const name = tokens.getToken();
    if (this.functions[name] !== undefined) {
      throw new Error(`Error: ${name} is a function`);
    }

    tokens.getToken(); // pass `=`
    const v = this.parseExpression(tokens);
    this.vars[name] = v;
    return this.vars[name];
  }

  parseTerm(tokens, env = {}) {
    let v1 = this.parsePrimaryExpression(tokens, env); // 1

    for (;;) {
      const token = tokens.getToken();
      if (token !== '*' && token !== '/' && token !== '%') {
        tokens.ungetToken();
        break;
      }

      const v2 = this.parsePrimaryExpression(tokens, env);

      if (token === '*') {
        v1 *= v2;
      } else if (token === '/') {
        v1 /= v2;
      } else if (token === '%') {
        v1 %= v2;
      }
    }

    return v1;
  }

  parsePrimaryExpression(tokens, env = {}) {
    let token = tokens.getToken();

    let minusFlag = false;
    if (token === '-') {
      minusFlag = true;
    } else {
      tokens.ungetToken();
    }

    token = tokens.getToken();

    let v;
    if (/\d/.test(token)) {
      v = Number(token);
      if (minusFlag) v = -v;
    } else if (/[a-zA-Z]/.test(token)) {
      if (this.functions[token] !== undefined) {
        const fn = this.functions[token];
        v = this.executeFunction(fn, tokens);
      } else if (env[token] !== undefined) {
        v = this.parsePrimaryExpression(new Token(env[token]));
      } else if (this.vars[token] !== undefined) {
        v = this.vars[token];
      } else {
        v = token;
      }
    } else if (token === '(') {
      v = this.parseExpression(tokens, env);
      tokens.getToken(); // pass `)`
    } else {
      tokens.ungetToken();
    }

    if (/\d/.test(token)) {
      v = Number(token);
      if (minusFlag) v = -v;
    }
    return v;
  }

  executeFunction(fn, tokens) {
    const { params, block } = fn;
    const paramObj = {};
    for (const p of params) {
      paramObj[p] = this.parseExpression(tokens);
    }
    return this.parseExpression(new Token(block.join('')), paramObj);
  }
}

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.setPrompt('>>> ');
rl.prompt();

const iter = new Interpreter();

rl.on('line', line => {
  const res = iter.input(line);
  console.log(res);
  rl.prompt();
});

rl.on('close', _ => {
  process.exit(0);
});

process.on('uncaughtException', e => {
  console.log(e.message);
  rl.prompt();
});