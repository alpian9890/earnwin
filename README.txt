EARNAPP BINARY EXTRACTED FILES
===============================

Main entry point:
  snapshot/svc/earnapp_cli/earnapp/index.js

Important files:
  - peer_node/client.js        → Core client logic & OS detection
  - util.js                     → Helper utilities
  - installer.js                → Installation logic
  - operator.js                 → Service operations
  - conf.js                     → Configuration

OS Detection Found:
  Line 606 in peer_node/client.js:
    get_release() reads /etc/os-release via linux-release-info

  Line 652 in peer_node/client.js:
    Data sent to server includes:
      - arch: os.arch()
      - release: get_release()  
      - platform: 'node'

Extracted using: https://github.com/LockBlock-dev/pkg-unpacker
