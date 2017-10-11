
const app = require('express')();
const bcrypt = require('bcrypt');
const uuid4 = require('uuid/v4');
const bodyParser = require('body-parser');
const URL = require('url-parse');
const rp = require('request-promise'); 


const saltRounds = 10;
// const salt = bcrypt.genSaltSync(saltRounds);
const salt = '$2a$10$gMk3Imt7iXvr9KEkBX0d/O';

const node_identifier = uuid4().replace('-', '');

/** Blockchain Class */
class Blockchain {
 
  constructor() {
    this.chain = [];
    this.currentTransactions = [];
    this.nodes = new Set();
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

  /**
    Add a new node to the list of nodes
    :param address: <str> Address of node. Eg. 'http://192.168.0.5:5000'
    :return: None
  */
  register_node(address) {
    var url = URL(address);
    this.nodes.add(url.host);
  }

  /**
    Determine if a given blockchain is valid
    :param chain: <list> A blockchain
    :return: <bool> True if valid, False if not
  */
  valid_chain(chain) {
    console.log('Validating Chain', chain)
    var lastBlock = chain[0];
    var currentIndex = 1;

    while( currentIndex < chain.length ) {
      let block = chain[currentIndex];
      console.log('lastBlock: ', lastBlock);
      console.log('block: ', block);
      console.log('\n-----------------------\n');
      // Check that the block's hash is correct
      if(block.previous_hash !== this.hash(lastBlock)) return false;
      // Check that proof of work is correct
      if(!this.validateProof(lastBlock.proof, block.proof)) return false;

      lastBlock = block;
      currentIndex++
    }
    console.log('Is Valid Chain!')
    return true
  }

  /**
   * This is our Consensus Algorithm, it resolves conflicts
   * by replacing our chain with the longest one in the network.
   * :return: <bool> True if our chain was replaced, False if not
   */
  async resolve_conflicts() {
    console.log("resolving conflicts")
    var neighbors = [];
    this.nodes.forEach(node => neighbors.push(node));
    var newChain;

    // We're only looking for chains longer than ours
    var maxLength = this.chain.length;
    // Grab and verify the chains from all the nodes in our network

    return Promise.all(neighbors.map(node => {
      return rp.get(`http://${node}/chain`)
      .then((data) => {
        return JSON.parse(data)
      })
      .catch(err => { 
        console.log(error); 
        return null;
      })
    }))
    .then(neighborChains => {
  
      for(let i = 0; i < neighborChains.length; i++) {
        var node = neighborChains[i]
        if(node) {
          var length = node.length;
          var chain = node.chain;
  
          if(length > maxLength && this.valid_chain(chain)) {
            maxLength = length;
            newChain = chain;
          }
        }
      }
      
      if(newChain) {
        this.chain = newChain;
        return true;
      }
  
      return false;
    
    })
  }
}

const blockchain = new Blockchain()

/** Express Configuration */
app.set("port", 5800);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/mine', function(req, res) {
  (function mine() {
    const last_block = blockchain.lastBlock();
    proof = blockchain.proofOfWork(last_block.proof)

    blockchain._newTransaction({
      sender: 0,
      recipient: node_identifier,
      amount: 1
    })

    const block = {index, transactions, proof, previous_hash} = blockchain._newBlock(proof);

    res.status(200).send(JSON.stringify({
      message: "New block forged",
      index,
      transactions,
      proof, 
      previous_hash
    }));
  })()
})

app.post('/transactions/new', function(req, res) {
  (function new_transaction(){
    const values = {sender, recipient, amount} = req.body;
    const required = ['sender', 'recipient', 'amount'];
    
    // Check for required fields
    for(let i = 0; i < 3; i++) {
      if(!values[required[i]]) {
        res.status(400).send(`Missing request data: "${required[i]}" `)
        return 
      }
    }

    // Create a new transaction
    const index = blockchain._newTransaction(sender, recipient, amount);
    
    res.status(201).send(`Transaction will be added to Block ${index}`);
  })()
})

app.get('/chain', function(req, res){
  (function full_chain(){
    var response = {
      chain: blockchain.chain,
      length: blockchain.chain.length
    }
    
    res.status(200).send(response)
  })()
})

app.post('/nodes/register', function(req, res) {
  (function registerNode(){
    var { nodes } = req.body;
    if(nodes === undefined) {
      res.statusCode(400).send("Please supply a valid list of nodes")
    }

    nodes.forEach(node => blockchain.register_node(node));
    res.send({
      message: "New nodes have been added",
      total_nodes: [...blockchain.nodes]
    })
  }())
})

app.get('/nodes/resolve', function(req, res) {
  ( async function consensus(){
    var response = {};
    var replaced = await blockchain.resolve_conflicts();

    if(replaced) {
      response = {
        message: 'Our chain was replaced',
        new_chain: blockchain.chain
      }
    } else {
      response = {
        message: 'Our chain is authorative',
        chain: blockchain.chain
      }
    }
    res.status(200).send(response);
  }())
})

app.listen(app.get("port"), () => {
  console.log(` App is running at http://localhost:${app.get("port")}`);
  console.log(" Press CTRL-C to stop\n");
});
