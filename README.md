# hashnet

diffie-hellman-merkle key exchange based

// A builds secret key
a  = rand();
ap = randPrime();
ag = primitive root modulo p

// B build secret key
b  = rand();
bp = randPrime();
bg = primitive root modulo p

// A & B build public keys
aA = ag^a % ap
bB = bg^b % bp
pubA = ap,ag,aA
pubB = bp,bg,bB

A sends msg to B:

generate A to be received by B
- bA = bg^a % bp
- S  = bB^a % bp

pubB,bA,enc(S,pubA||m)

B sends msg to A:

generate B to be received by A
- aB = ab^b % ap
- S  = aA^b % bp

pubA,aB,enc(S,pubB||m)

receiver can only decrypt if receiver is honest
full-comms are only possible if both parties are honest

mitm resistance:
neither a nor b is published, S can't be generated without them
only pubB receiver can receive the true message
like udp, sender can be faked, but this results in a new encryption key in our protocol

-----------

TODO:
- proper protocol name
- define wire spec on tcp
- define wire spec on webrtc
- define wire spec on websocket

Network structure:
- node IDs are public keys (pubkey for random generated key)
  - Collision detection?
  - Persistent?
- All messages are signed and need nonce
- Distance between 2 nodes = amount of non-equal bits between IDs
- Peer discovery (TODO)
  - Always keep looking
  - Max [hashlen] connections
  - Connect to closest non-connected found node
  - Drop furthest node if full
- Routing:
  - Each package has a sender & receiver field
  - On incoming package
    - Not the receiver? relay to the closest known/connected node to the receiver
    - Receiver? emit event (TBD)
- Overlay support (sortof like ports for tcp, but named)

Required features:
- remote connection type checking
- control message relay

Planned overlays:
- persistent storage
  - signed/owned
  - multi-owner
  - only owners (if not public) can update again
  - separate auth & new pubkeys to allow key updates
- volatile lists
  - could be used as dynamic dns (will need signatures)
  - signed/owned entries?
  - entries in ID expire every N minutes/seconds

## Network Packet


