
var app = require('express')();
var bcrypt = require('bcrypt');
var uuid4 = require('uuid/v4');
var bodyParser = require('body-parser')


const saltRounds = 10;
var salt = bcrypt.genSaltSync(saltRounds);

const node_identifier = uuid4().replace('-', '');

/** Blockchain Class */
class Blockchain {
 
  constructor() {
    this.chain = [];
    this.currentTransactions = [];

    /** Create a genisis block */
    this._newBlock( 100, 1 );
  }

  /** Creates a new Block and adds it to the chain */
  _newBlock(proof, previous_hash=null) {

    const block = {
      index: this.chain.length,
      timestamp: new Date(),
      transactions: this.currentTransactions,
      proof,
      previous_hash: previous_hash || this.hash(this.chain[this.chain.length - 1])
    }

    // Reset list of current transactions
    this.currentTransactions = [];
    this.chain.push(block)
    return block
  }

  /** Adds a new transaction to the list of transactions */
  _newTransaction(sender, recipient, amount) {
    this.currentTransactions.push({
      sender,
      recipient, 
      amount
    })

    return this.lastBlock().index + 1;
  }
  
  /** Hashes a block */
  hash(block) {
    return bcrypt.hashSync(JSON.stringify(block), salt);
  }

  /** Returns the last block in the chain */
  lastBlock () {
    return this.chain[this.chain.length - 1]
  }

  proofOfWork(lastProof) {
    /** 
      Simple Proof of Work Algorithm:
        - Find a number p' such that hash(pp') contains leading 4 zeroes, where p is the previous p'
        - p is the previous proof, and p' is the new proof
    */
    var proof = 0;
    while(!this.validateProof(lastProof, proof)) {
      proof++
    }
    return proof
  }

  validateProof(last_proof, proof) {
    /**
      Validates the Proof: Does hash(last_proof, proof) contain 4 leading zeroes?
    */

    var guess = bcrypt.hashSync((last_proof * proof).toString(), salt);
    console.log(guess.slice(29));
    return guess.split('').slice(29, 30).join('') === '0'
  }
}

const blockchain = new Blockchain()

/** Express Configuration */
app.set("port", 4800);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/mine', function(req, resp) {
  (function mine() {
    const last_block = blockchain.lastBlock();
    proof = blockchain.proofOfWork(last_block.proof)

    blockchain._newTransaction({
      sender: 0,
      recipient: node_identifier,
      amount: 1
    })

    const block = {index, transactions, proof, previous_hash} = blockchain._newBlock(proof);

    resp.status(200).send(JSON.stringify({
      message: "New block forged",
      index,
      transactions,
      proof, 
      previous_hash
    }));
  })()
})

app.post('/transactions/new', function(req, resp) {
  (function new_transaction(){
    const values = {sender, recipient, amount} = req.body;
    const required = ['sender', 'recipient', 'amount'];
    
    // Check for required fields
    for(let i = 0; i < 3; i++) {
      if(!values[required[i]]) {
        resp.status(400).send(`Missing request data: "${required[i]}" `)
        return 
      }
    }

    // Create a new transaction
    const index = blockchain._newTransaction(sender, recipient, amount);
    
    resp.status(201).send(`Transaction will be added to Block ${index}`);
  })()
})

app.get('/chain', function(req, resp){
  (function full_chain(){
    var response = {
      chain: blockchain.chain,
      length: blockchain.chain.length
    }
    
    resp.status(200).send(response)
  })()
})

app.listen(app.get("port"), () => {
  console.log(` App is running at http://localhost:${app.get("port")}`);
  console.log(" Press CTRL-C to stop\n");
});
