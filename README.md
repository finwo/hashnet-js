# hashnet

Multi-hop rpc router

## Install

```
npm install --save hashnet
```

## What

Hashnet (although the name was poorly chosen at the start of the project) handles routing of rpc calls within an overlay network.

## What not

- Peer discovery
- Service discovery (maybe procedure listing in the future?)
- Gateway into different networks

## API

To load the core element of this package, include the following code:

```js
const {Peer} = require('hashnet');
```

### new Peer(options)

Returns a new peer which can act as a node within the network.

Options:
| Name           | Type   | Default | Description                                                      |
| -------------- | ------ | ------- | ---------------------------------------------------------------- |
| id             | string | null    | Set the ID of the peer instead of generating one                 |
| interval       | number | 5000    | Interval to check connections with                               |
| timeout        | number | 2000    | Maximum time in milliseconds a procedure call is allowed to take |
| maxConnections | number | 15      | Maximum amount of connections the peer is allowed to manage      |
| routeLabelSize | number | 32      | Route label size included in packages (must match the network)   |

### peer.addProcedure({ name, handler })

Adds a procedure handler locally. If multiple handlers are registered under the same name, the return value of the earlier handler is fed into the next handler.

Options:
| Name                  | Type     | Default   | Description                                        |
| --------------------- | -------- | --------- | -------------------------------------------------- |
| name                  | string   | undefined | Name of the procedure to register under            |
| handler(data,message) | function | undefined | Function to call when the procedure is called upon |

### peer.removeProcedure({ name, handler })

Removes the given handler from the named handler list.

Options:
| Name                  | Type     | Default   | Description                                        |
| --------------------- | -------- | --------- | -------------------------------------------------- |
| name                  | string   | undefined | Name of the procedure to remove the handler from   |
| handler(data,message) | function | undefined | Function to not call anymore                       |

### peer.addConnection(socket)

Adds a managed connection to the list of known connections.

The given socket must follow the same API as defined by [simple-peer](https://npmjs.com/package/simple-peer)

### peer.callProcedure({ peerId, procedure, data, getResponse })

Call a (remote) procedure within the network on the peer having the given peerId.

Options:
| Name        | Type    | Default | Description                                       |
| ----------- | ------- | ------- | ------------------------------------------------- |
| peerId      | string  | null    | null = self ; The peer to call the procedure on   |
| procedure   | string  | null    | Which procedure to call                           |
| data        | mixed   | null    | Data to pass into the procedure handler           |
| getResponse | boolean | true    | Whether or not to retrieve the handler's response |

### peer.shutdown()

Shut down the whole peer, closing all connections.

## Internal API

The internal API is not intended for application use. This is documented for use within connection brokers, plugins & other non-application purposes.

### peer._callProcedure({ routeLabel, connection, socket, procedure, data, getResponse })

Call a remote procedure, sending the request over the given socket with the given routeLabel.

Options:
| Name        | Type              | Default   | Description                                       |
| ----------- | ----------------- | --------- | ------------------------------------------------- |
| routeLabel  | string, BitBuffer | undefined | Which hops to follow towards the targetted peer   |
| connection  | n/a               | undefined | Internal representation of a connection           |
| socket      | simple-peer       | undefined | Socket to send the call over                      |
| procedure   | string            | undefined | Which procedure to call on the targetted peer     |
| data        | mixed             | undefined | Data to pass into the handler of the procedure    |
| getResponse | boolean           | true      | Whether or not to retrieve the handler's response |

### _findPeer(peerId)

Find the path to a peer with the given peer id.

Options:
| Name   | Type           | Default   | Description                                          |
| ------ | -------------- | --------- | ---------------------------------------------------- |
| peerId | string, Buffer | undefined | A hex string or buffer representing the peer to find |
