// AUTO-GENERATED from contracts/passkey-not-sender.clar - do not edit by hand.
// Regenerate with: npm run gen:abi

export const passkeyNotSenderAbi = {
  "functions": [
    {
      "name": "is-contract-owner",
      "access": "private",
      "args": [],
      "outputs": {
        "type": {
          "response": {
            "ok": "bool",
            "error": "uint128"
          }
        }
      }
    },
    {
      "name": "register-passkey",
      "access": "public",
      "args": [
        {
          "name": "public-key",
          "type": {
            "buffer": {
              "length": 33
            }
          }
        }
      ],
      "outputs": {
        "type": {
          "response": {
            "ok": "bool",
            "error": "uint128"
          }
        }
      }
    },
    {
      "name": "set-owner",
      "access": "public",
      "args": [
        {
          "name": "new-owner",
          "type": "principal"
        }
      ],
      "outputs": {
        "type": {
          "response": {
            "ok": "bool",
            "error": "uint128"
          }
        }
      }
    },
    {
      "name": "set-passkey-enabled",
      "access": "public",
      "args": [
        {
          "name": "public-key",
          "type": {
            "buffer": {
              "length": 33
            }
          }
        },
        {
          "name": "enabled",
          "type": "bool"
        }
      ],
      "outputs": {
        "type": {
          "response": {
            "ok": "bool",
            "error": "uint128"
          }
        }
      }
    },
    {
      "name": "set-rp-id-hash",
      "access": "public",
      "args": [
        {
          "name": "rp-id",
          "type": {
            "string-ascii": {
              "length": 250
            }
          }
        }
      ],
      "outputs": {
        "type": {
          "response": {
            "ok": {
              "buffer": {
                "length": 32
              }
            },
            "error": "uint128"
          }
        }
      }
    },
    {
      "name": "transfer-not",
      "access": "public",
      "args": [
        {
          "name": "public-key",
          "type": {
            "buffer": {
              "length": 33
            }
          }
        },
        {
          "name": "amount",
          "type": "uint128"
        },
        {
          "name": "name",
          "type": {
            "buffer": {
              "length": 48
            }
          }
        },
        {
          "name": "namespace",
          "type": {
            "buffer": {
              "length": 20
            }
          }
        },
        {
          "name": "memo",
          "type": {
            "optional": {
              "buffer": {
                "length": 34
              }
            }
          }
        },
        {
          "name": "nonce",
          "type": "uint128"
        },
        {
          "name": "authenticator-data",
          "type": {
            "buffer": {
              "length": 256
            }
          }
        },
        {
          "name": "client-data-prefix",
          "type": {
            "buffer": {
              "length": 128
            }
          }
        },
        {
          "name": "client-data-suffix",
          "type": {
            "buffer": {
              "length": 512
            }
          }
        },
        {
          "name": "signature",
          "type": {
            "buffer": {
              "length": 64
            }
          }
        }
      ],
      "outputs": {
        "type": {
          "response": {
            "ok": "bool",
            "error": "uint128"
          }
        }
      }
    },
    {
      "name": "update-context",
      "access": "public",
      "args": [
        {
          "name": "function-name",
          "type": {
            "string-ascii": {
              "length": 100
            }
          }
        },
        {
          "name": "called",
          "type": "uint128"
        }
      ],
      "outputs": {
        "type": {
          "response": {
            "ok": "bool",
            "error": "none"
          }
        }
      }
    },
    {
      "name": "withdraw-not",
      "access": "public",
      "args": [
        {
          "name": "amount",
          "type": "uint128"
        },
        {
          "name": "recipient",
          "type": "principal"
        }
      ],
      "outputs": {
        "type": {
          "response": {
            "ok": "bool",
            "error": "uint128"
          }
        }
      }
    },
    {
      "name": "get-challenge-base64",
      "access": "read_only",
      "args": [
        {
          "name": "amount",
          "type": "uint128"
        },
        {
          "name": "name",
          "type": {
            "buffer": {
              "length": 48
            }
          }
        },
        {
          "name": "namespace",
          "type": {
            "buffer": {
              "length": 20
            }
          }
        },
        {
          "name": "memo",
          "type": {
            "optional": {
              "buffer": {
                "length": 34
              }
            }
          }
        },
        {
          "name": "nonce",
          "type": "uint128"
        }
      ],
      "outputs": {
        "type": {
          "buffer": {
            "length": 43
          }
        }
      }
    },
    {
      "name": "get-nonce",
      "access": "read_only",
      "args": [
        {
          "name": "public-key",
          "type": {
            "buffer": {
              "length": 33
            }
          }
        }
      ],
      "outputs": {
        "type": "uint128"
      }
    },
    {
      "name": "get-owner",
      "access": "read_only",
      "args": [],
      "outputs": {
        "type": "principal"
      }
    },
    {
      "name": "get-passkey",
      "access": "read_only",
      "args": [
        {
          "name": "public-key",
          "type": {
            "buffer": {
              "length": 33
            }
          }
        }
      ],
      "outputs": {
        "type": {
          "optional": {
            "tuple": [
              {
                "name": "enabled",
                "type": "bool"
              },
              {
                "name": "nonce",
                "type": "uint128"
              }
            ]
          }
        }
      }
    },
    {
      "name": "get-rp-id-hash",
      "access": "read_only",
      "args": [],
      "outputs": {
        "type": {
          "buffer": {
            "length": 32
          }
        }
      }
    },
    {
      "name": "get-transfer-message-hash",
      "access": "read_only",
      "args": [
        {
          "name": "amount",
          "type": "uint128"
        },
        {
          "name": "name",
          "type": {
            "buffer": {
              "length": 48
            }
          }
        },
        {
          "name": "namespace",
          "type": {
            "buffer": {
              "length": 20
            }
          }
        },
        {
          "name": "memo",
          "type": {
            "optional": {
              "buffer": {
                "length": 34
              }
            }
          }
        },
        {
          "name": "nonce",
          "type": "uint128"
        }
      ],
      "outputs": {
        "type": {
          "buffer": {
            "length": 32
          }
        }
      }
    },
    {
      "name": "invariant-rp-id-defaults-to-zero",
      "access": "read_only",
      "args": [],
      "outputs": {
        "type": "bool"
      }
    },
    {
      "name": "invariant-rp-id-well-formed",
      "access": "read_only",
      "args": [],
      "outputs": {
        "type": "bool"
      }
    },
    {
      "name": "invariant-transfer-requires-rp-id",
      "access": "read_only",
      "args": [],
      "outputs": {
        "type": "bool"
      }
    },
    {
      "name": "name-has-received",
      "access": "read_only",
      "args": [
        {
          "name": "name",
          "type": {
            "buffer": {
              "length": 48
            }
          }
        },
        {
          "name": "namespace",
          "type": {
            "buffer": {
              "length": 20
            }
          }
        }
      ],
      "outputs": {
        "type": "bool"
      }
    },
    {
      "name": "transfer-message-hash",
      "access": "read_only",
      "args": [
        {
          "name": "amount",
          "type": "uint128"
        },
        {
          "name": "name",
          "type": {
            "buffer": {
              "length": 48
            }
          }
        },
        {
          "name": "namespace",
          "type": {
            "buffer": {
              "length": 20
            }
          }
        },
        {
          "name": "memo",
          "type": {
            "optional": {
              "buffer": {
                "length": 34
              }
            }
          }
        },
        {
          "name": "nonce",
          "type": "uint128"
        }
      ],
      "outputs": {
        "type": {
          "buffer": {
            "length": 32
          }
        }
      }
    }
  ],
  "variables": [
    {
      "name": "DOMAIN_HASH",
      "type": {
        "buffer": {
          "length": 32
        }
      },
      "access": "constant"
    },
    {
      "name": "ERR_ALREADY_REGISTERED",
      "type": {
        "response": {
          "ok": "none",
          "error": "uint128"
        }
      },
      "access": "constant"
    },
    {
      "name": "ERR_AMOUNT_TOO_LARGE",
      "type": {
        "response": {
          "ok": "none",
          "error": "uint128"
        }
      },
      "access": "constant"
    },
    {
      "name": "ERR_BAD_NONCE",
      "type": {
        "response": {
          "ok": "none",
          "error": "uint128"
        }
      },
      "access": "constant"
    },
    {
      "name": "ERR_BAD_SIGNATURE",
      "type": {
        "response": {
          "ok": "none",
          "error": "uint128"
        }
      },
      "access": "constant"
    },
    {
      "name": "ERR_NAME_ALREADY_RECEIVED",
      "type": {
        "response": {
          "ok": "none",
          "error": "uint128"
        }
      },
      "access": "constant"
    },
    {
      "name": "ERR_NAME_UNRESOLVED",
      "type": {
        "response": {
          "ok": "none",
          "error": "uint128"
        }
      },
      "access": "constant"
    },
    {
      "name": "ERR_NOT_OWNER",
      "type": {
        "response": {
          "ok": "none",
          "error": "uint128"
        }
      },
      "access": "constant"
    },
    {
      "name": "ERR_PASSKEY_DISABLED",
      "type": {
        "response": {
          "ok": "none",
          "error": "uint128"
        }
      },
      "access": "constant"
    },
    {
      "name": "ERR_PASSKEY_NOT_FOUND",
      "type": {
        "response": {
          "ok": "none",
          "error": "uint128"
        }
      },
      "access": "constant"
    },
    {
      "name": "ERR_RP_ID_HASH_FAILURE",
      "type": {
        "response": {
          "ok": "none",
          "error": "uint128"
        }
      },
      "access": "constant"
    },
    {
      "name": "ERR_RP_ID_NOT_SET",
      "type": {
        "response": {
          "ok": "none",
          "error": "uint128"
        }
      },
      "access": "constant"
    },
    {
      "name": "ERR_USER_NOT_VERIFIED",
      "type": {
        "response": {
          "ok": "none",
          "error": "uint128"
        }
      },
      "access": "constant"
    },
    {
      "name": "FREE_LIMIT",
      "type": "uint128",
      "access": "constant"
    },
    {
      "name": "SIP018_PREFIX",
      "type": {
        "buffer": {
          "length": 6
        }
      },
      "access": "constant"
    },
    {
      "name": "ZERO_HASH",
      "type": {
        "buffer": {
          "length": 0
        }
      },
      "access": "constant"
    },
    {
      "name": "contract-owner",
      "type": "principal",
      "access": "variable"
    },
    {
      "name": "rp-id-hash",
      "type": {
        "buffer": {
          "length": 32
        }
      },
      "access": "variable"
    }
  ],
  "maps": [
    {
      "name": "context",
      "key": {
        "string-ascii": {
          "length": 100
        }
      },
      "value": {
        "tuple": [
          {
            "name": "called",
            "type": "uint128"
          }
        ]
      }
    },
    {
      "name": "passkeys",
      "key": {
        "buffer": {
          "length": 33
        }
      },
      "value": {
        "tuple": [
          {
            "name": "enabled",
            "type": "bool"
          },
          {
            "name": "nonce",
            "type": "uint128"
          }
        ]
      }
    },
    {
      "name": "received-names",
      "key": {
        "tuple": [
          {
            "name": "name",
            "type": {
              "buffer": {
                "length": 48
              }
            }
          },
          {
            "name": "namespace",
            "type": {
              "buffer": {
                "length": 20
              }
            }
          }
        ]
      },
      "value": "bool"
    }
  ],
  "fungible_tokens": [
    {
      "name": "anti-phishing"
    }
  ],
  "non_fungible_tokens": [],
  "epoch": "Epoch34"
} as const;
