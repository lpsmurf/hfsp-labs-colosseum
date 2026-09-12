// TEST FIXTURE — not real credentials, not executed.
//
// The PRIVATE_KEY below is the canonical go-ethereum example key, published in
// countless tutorials and holding nothing on any network. It is here so the
// secrets engine has something it MUST report.
//
// The two values beneath it are an EIP-1967 admin storage slot and a
// PERMIT_TYPEHASH: identical in shape (32-byte hex), opposite in meaning. The
// engine must ignore both. That contrast is the whole point of the fixture.

const PRIVATE_KEY = "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
const EIP1967_ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
const PERMIT_TYPEHASH = "0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9";
