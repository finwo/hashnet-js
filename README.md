# hashnet

TODO:
- proper protocol name
- define wire spec on tcp
- define wire spec on webrtc
- define wire spec on websocket

Network structure:
- 512-bit IDs (random generated)
  - Collision detection?
  - Persistent?
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
