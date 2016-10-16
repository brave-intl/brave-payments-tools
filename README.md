# payments-tools
Based on this [blog post](https://blog.bitgo.com/cold-offline-key-support-with-bitgo-multi-sig-2/),
and Similar to the BitGo [cli tool](https://github.com/BitGo/bitgo-cli),
but tailored more for batch-like operations.

To emphasize:

* files are transferred between the cold machine and the networked machine via USB stick;

* after one-time configuration, the cold machine is never connected to the network; and,

* recovery files are distributed to `N` trusted actors via USB stick,
with at least `M` trusted actors required to co-operate in order to recovery the passphrases for the private keys.

# Creating a Wallet
To summarize:

1. Two keypairs are created on the cold machine,
the private keys are encrypted with user-supplied passphrases,
a keychains file is prepared for the networked machine,
and (partial) recovery files are generated for distribution.

2. The keychains file is used by the networked machine to create an HD wallet on the BitGo server.

## On the Cold Machine

    % bin/offline-create-keychains
    prompt: User Keychain passphrase: ******
    prompt: Backup Keychain passphrase: ******

    wrote keychains-779826ce-a74f-4d61-907a-0d238db9808f.json
    wrote recovery_0_2_3-779826ce-a74f-4d61-907a-0d238db9808f.json
    wrote recovery_1_2_3-779826ce-a74f-4d61-907a-0d238db9808f.json
    wrote recovery_2_2_3-779826ce-a74f-4d61-907a-0d238db9808f.json

The two passphrases are used to encrypt the private key for the user and backup keychains, respectively.
A strong password must be used for each
(Requiring at least `10^17` guesses according to [zxcvbn](https://github.com/dropbox/zxcvbn).)
Private keys are encrypted using

    sjcl.encrypt(passPhrase, privateKey, { iter: 100000, ks: 256, salt: sjcl.random.randomWords(2, 0) })

The keychains file is kept on the cold machine and transferred to the networked machine,
e.g.,

    {
      "userKey": {
        "xpub": "xpub..."
        "label": "user",
        "encryptedXprv": "{...}"
      },
      "backupKey": {
        "xpub": "xpub...",
        "label": "backup",
        "encryptedXprv": "{...}"
      }
    }

The recovery files are immediately copied to N different USB sticks,
e.g.,

    {
      "userKey": {
        "xpub": "xpub..."
        "label": "user",
        "encryptedXprv": "{...}",
        "share_0": "..."
      },
      "backupKey": {
        "xpub": "xpub...",
        "label": "backup",
        "encryptedXprv": "{...}",
        "share_0": "..."
      }
    }

and then "securely" deleted from the cold machine.
These recovery files can be used to reconstruct the user and backup keys using
[Shamir's threshold secret sharing scheme](http://en.wikipedia.org/wiki/Shamir's_Secret_Sharing).

## On the Networked Machine

    % bin/online-create-wallet \
        --keychains keychains-779826ce-a74f-4d61-907a-0d238db9808f.json
    prompt: BitGo email-address:
    prompt: BitGo password-address:
    prompt: BitGo OTP:
    prompt: BitGo access-token: ...

    wrote wallet-779826ce-a74f-4d61-907a-0d238db9808f.json

The wallet file has no sensitive information,
and is kept on the networked machine, e.g.,


    {
      "label": "779826ce-a74f-4d61-907a-0d238db9808f",
      "authenticate": {
        "username": ""
      },
      "wallet": {
        "id": "33bKSJbCoXWuue89bYhqFvSyHZ1MzvZJt8"
      }
    }

# Submitting a Transaction

To summarize:

1. A payments file is prepared on the networked machine,
e.g.,

        { "1JQPqfRW2xKKQkFWd62MvZq2Ed7B7x8KU" : 500000 }

    which contains a list of Bitcoin addresses to be credited.

2. An unsigned transaction is created,
and then transferred to the cold machine.

3. On the cold machine,
the transaction is signed (requiring the operator to enter the passphrase for the user keypair's private key).

4. The signed transaction is then transferred to the networked machine and submitted to the BitGo server.

## On the Networked Machine

    % bin/online-create-transaction \
        --wallet wallet-779826ce-a74f-4d61-907a-0d238db9808f.json \
        --payments payments-batch1.json 
    prompt: BitGo access-token: ...

    wrote unsigned-batch1.json

This file is then transferred to the cold machine,
e.g.,

    {
      "transactionHex": "...",
      "unspents": [ ... ],
      "fee": 33953,
      "changeAddresses": [
        {
          "address": "3JDpx9s3Pit6BnNBQ467dJFPNjHGRAwQu9",
          "amount": 982616
        }
      ],
      "walletId": "33bKSJbCoXWuue89bYhqFvSyHZ1MzvZJt8",
      "walletKeychains": [ ... ],
      "feeRate": 51600,
      "estimatedSize": 658,
      "travelInfos": [],
      "authenticate": {
        "username": ""
      }
    }

## On the Cold Machine

    % bin/offline-sign-transaction \
        --unsignedTx unsigned-batch1.json
    prompt: User Keychain passphrase: ******

    wrote signed-batch1.json

This file is then transferred to the networked machine,
e.g.,

    {
      "tx": "...",
      "walletId": "33bKSJbCoXWuue89bYhqFvSyHZ1MzvZJt8",
      "authenticate": {
        "username": ""
      }
    }

## On the Networked Machine

    % bin/online-submit-transaction \
        --signedTx signed-batch1.json
    prompt: BitGo access-token: ...

    wrote submit-batch1.json

The resulting file may be archived,
e.g.,

    {
      "status": "accepted",
      "tx": "...",
      "hash": "e5a18cb5718844122cc1b23d898e0a03942f34b1cb90e8d8958e77e3c7b4c61c",
      "instant": false,
      "walletId": "33bKSJbCoXWuue89bYhqFvSyHZ1MzvZJt8",
      "message": "batch1"
    }

The payments, unsigned transaction, and signed transaction files should be archived for auditing purposes.


# Passphrase Recovery

`M` of the `N` trusted actors place their recovery files on the cold machine and run

    % bin/offline-recover-passphrases *.json

This outputs the passphrases used to encrypt the private keys for the user and backup keypairs.
The recovery files should then be "securely" deleted from the third machine.