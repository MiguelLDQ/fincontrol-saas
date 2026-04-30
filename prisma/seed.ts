import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { createCipheriv, randomBytes, scryptSync } from 'crypto';

const prisma = new PrismaClient();
const key = scryptSync(
  process.env.ENCRYPTION_SECRET ?? 'dev-encryption-secret-32-chars-ok!',
  process.env.ENCRYPTION_SALT   ?? 'dev-salt-string-here',
  32
) as Buffer;

function enc(t: string): Buffer {
  const iv = randomBytes(16);
  const c  = createCipheriv('aes-256-gcm', key, iv);
  const e  = Buffer.concat([c.update(t,'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), e]);
}
function encAmt(n: number) { return enc(n.toFixed(8)); }
function ago(d: number) { const x=new Date(); x.setDate(x.getDate()-d); return x; }

async function main() {
  console.log('🌱 Iniciando seed...\n');

  await prisma.chatMessage.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.investmentPrice.deleteMany();
  await prisma.investment.deleteMany();
  await prisma.document.deleteMany();
  await prisma.automationRule.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.billingEvent.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.category.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  console.log('✓ Banco limpo');

  const t1 = await prisma.tenant.create({ data: { name:'João Silva', slug:'joao-silva', plan:'PRO', isActive:true, planExpiresAt: ago(-30) } });
  const u1 = await prisma.user.create({ data: { tenantId:t1.id, email:'joao@exemplo.com', passwordHash: await argon2.hash('Senha@2025!',{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:4}), name:'João Silva', role:'OWNER' } });

  const [nubank,poup,cartao,corr] = await Promise.all([
    prisma.account.create({data:{tenantId:t1.id,name:'Conta Corrente Nubank',type:'CHECKING',encryptedBalance:encAmt(12847.60),currency:'BRL'}}),
    prisma.account.create({data:{tenantId:t1.id,name:'Poupança Nubank',type:'SAVINGS',encryptedBalance:encAmt(8200),currency:'BRL'}}),
    prisma.account.create({data:{tenantId:t1.id,name:'Cartão Nubank',type:'CREDIT_CARD',encryptedBalance:encAmt(2890),currency:'BRL'}}),
    prisma.account.create({data:{tenantId:t1.id,name:'Corretora XP',type:'INVESTMENT',encryptedBalance:encAmt(23847),currency:'BRL'}}),
  ]);

  const [cSal,cFree,cRend,cAlug,cAlim,cDel,cTrp,cSau,cStr,cUtil,cInv,cTrf] = await Promise.all([
    prisma.category.create({data:{tenantId:t1.id,name:'Salário',type:'INCOME',color:'#00E5A0'}}),
    prisma.category.create({data:{tenantId:t1.id,name:'Freelance',type:'INCOME',color:'#0095FF'}}),
    prisma.category.create({data:{tenantId:t1.id,name:'Rendimentos',type:'INCOME',color:'#7C3AED'}}),
    prisma.category.create({data:{tenantId:t1.id,name:'Moradia',type:'EXPENSE',color:'#FF4D6A'}}),
    prisma.category.create({data:{tenantId:t1.id,name:'Alimentação',type:'EXPENSE',color:'#F59E0B'}}),
    prisma.category.create({data:{tenantId:t1.id,name:'Delivery',type:'EXPENSE',color:'#EF4444'}}),
    prisma.category.create({data:{tenantId:t1.id,name:'Transporte',type:'EXPENSE',color:'#3B82F6'}}),
    prisma.category.create({data:{tenantId:t1.id,name:'Saúde',type:'EXPENSE',color:'#10B981'}}),
    prisma.category.create({data:{tenantId:t1.id,name:'Streaming',type:'EXPENSE',color:'#8B5CF6'}}),
    prisma.category.create({data:{tenantId:t1.id,name:'Utilidades',type:'EXPENSE',color:'#78716C'}}),
    prisma.category.create({data:{tenantId:t1.id,name:'Investimentos',type:'EXPENSE',color:'#F97316'}}),
    prisma.category.create({data:{tenantId:t1.id,name:'Transferência',type:'TRANSFER',color:'#64748B'}}),
  ]);

  const txs = [
    {desc:'Salário — Empresa XPTO',acc:nubank.id,cat:cSal.id,amt:8500,type:'INCOME',d:3},
    {desc:'Aluguel Apartamento',acc:nubank.id,cat:cAlug.id,amt:2200,type:'EXPENSE',d:3},
    {desc:'iFood — Sushi Delivery',acc:cartao.id,cat:cDel.id,amt:89.90,type:'EXPENSE',d:6,tags:['ifood','delivery']},
    {desc:'Supermercado Carrefour',acc:cartao.id,cat:cAlim.id,amt:420.30,type:'EXPENSE',d:8},
    {desc:'Uber — Aeroporto',acc:cartao.id,cat:cTrp.id,amt:67.50,type:'EXPENSE',d:9},
    {desc:'Freelance Design UI',acc:nubank.id,cat:cFree.id,amt:1500,type:'INCOME',d:5},
    {desc:'Netflix',acc:cartao.id,cat:cStr.id,amt:55.90,type:'EXPENSE',d:1,tags:['streaming']},
    {desc:'Spotify',acc:cartao.id,cat:cStr.id,amt:21.90,type:'EXPENSE',d:1},
    {desc:'Academia Smart Fit',acc:cartao.id,cat:cSau.id,amt:99.90,type:'EXPENSE',d:1},
    {desc:'Transferência → Poupança',acc:nubank.id,cat:cTrf.id,amt:1000,type:'TRANSFER',d:7,toAcc:poup.id},
    {desc:'Rendimento CDB',acc:poup.id,cat:cRend.id,amt:127.40,type:'INCOME',d:3},
    {desc:'Pix — Maria',acc:nubank.id,cat:cFree.id,amt:350,type:'INCOME',d:11,tags:['pix']},
    {desc:'Farmácia Drogasil',acc:cartao.id,cat:cSau.id,amt:78.40,type:'EXPENSE',d:10},
    {desc:'iFood — Pizza Hut',acc:cartao.id,cat:cDel.id,amt:65.80,type:'EXPENSE',d:13,tags:['ifood']},
    {desc:'Conta de Energia',acc:nubank.id,cat:cUtil.id,amt:180,type:'EXPENSE',d:14,status:'PENDING'},
    {desc:'Internet Vivo',acc:nubank.id,cat:cUtil.id,amt:119.90,type:'EXPENSE',d:14},
    {desc:'Compra PETR4',acc:corr.id,cat:cInv.id,amt:1825,type:'EXPENSE',d:4,tags:['acoes']},
    {desc:'Salário — Empresa XPTO',acc:nubank.id,cat:cSal.id,amt:8500,type:'INCOME',d:32},
    {desc:'Aluguel Apartamento',acc:nubank.id,cat:cAlug.id,amt:2200,type:'EXPENSE',d:32},
    {desc:"iFood — McDonald's",acc:cartao.id,cat:cDel.id,amt:87.50,type:'EXPENSE',d:38,tags:['ifood']},
    {desc:'iFood — Madero',acc:cartao.id,cat:cDel.id,amt:95.30,type:'EXPENSE',d:42,tags:['ifood']},
    {desc:'Supermercado Extra',acc:cartao.id,cat:cAlim.id,amt:380.50,type:'EXPENSE',d:40},
    {desc:'Rendimento MXRF11',acc:corr.id,cat:cRend.id,amt:216.40,type:'INCOME',d:33},
    {desc:'Salário — Empresa XPTO',acc:nubank.id,cat:cSal.id,amt:8500,type:'INCOME',d:62},
    {desc:'Freelance Dev',acc:nubank.id,cat:cFree.id,amt:2800,type:'INCOME',d:65},
    {desc:'iFood — Outback',acc:cartao.id,cat:cDel.id,amt:138.90,type:'EXPENSE',d:68,tags:['ifood']},
    {desc:'Supermercado Pão de Açúcar',acc:cartao.id,cat:cAlim.id,amt:510.20,type:'EXPENSE',d:70},
    {desc:'Rendimento CDB',acc:poup.id,cat:cRend.id,amt:118.20,type:'INCOME',d:63},
  ];

  for(const tx of txs){
    await prisma.transaction.create({data:{
      tenantId:t1.id, accountId:tx.acc,
      toAccountId:(tx as any).toAcc??null,
      categoryId:tx.cat,
      description:tx.desc,
      encryptedAmount:encAmt(tx.amt),
      type:tx.type as any,
      status:((tx as any).status??'COMPLETED') as any,
      date:ago(tx.d),
      tags:(tx as any).tags??[],
    }});
  }
  console.log(`✓ ${txs.length} transações criadas`);

  const [p1,p2,p3,p4,p5] = await Promise.all([
    prisma.investment.create({data:{tenantId:t1.id,symbol:'PETR4',name:'Petrobras PN',type:'STOCK',quantity:150,avgPrice:34.20,currency:'BRL',exchange:'B3'}}),
    prisma.investment.create({data:{tenantId:t1.id,symbol:'MXRF11',name:'Maxi Renda FII',type:'FII',quantity:200,avgPrice:10.15,currency:'BRL',exchange:'B3'}}),
    prisma.investment.create({data:{tenantId:t1.id,symbol:'BTC',name:'Bitcoin',type:'CRYPTO',quantity:0.045,avgPrice:298000,currency:'BRL'}}),
    prisma.investment.create({data:{tenantId:t1.id,symbol:'IVVB11',name:'iShares S&P 500',type:'ETF',quantity:30,avgPrice:285.40,currency:'BRL',exchange:'B3'}}),
    prisma.investment.create({data:{tenantId:t1.id,symbol:'CDB-BB',name:'CDB BB 115% CDI',type:'FIXED_INCOME',quantity:1,avgPrice:5000,currency:'BRL'}}),
  ]);

  for(const [inv,vals] of [[p1,[34,34.8,36.5]],[p2,[10.1,10.5,10.82]],[p3,[295000,305000,312000]],[p4,[282,290,298]],[p5,[5100,5280,5412]]] as any[]){
    for(let i=0;i<vals.length;i++){
      await prisma.investmentPrice.create({data:{investmentId:inv.id,price:vals[i],source:'brapi_dev',fetchedAt:new Date(Date.now()-(vals.length-1-i)*7*86400_000)}});
    }
  }
  console.log('✓ Investimentos criados');

  await prisma.automationRule.createMany({data:[
    {tenantId:t1.id,name:'Categorizar iFood',isActive:true,priority:10,triggerOn:['TRANSACTION_CREATED'],conditions:JSON.stringify([{field:'description',operator:'contains',value:'iFood'}]),actions:JSON.stringify([{type:'set_category',params:{categoryId:cDel.id}}]),triggerCount:47},
    {tenantId:t1.id,name:'Separar 20% salário',isActive:true,priority:20,triggerOn:['TRANSACTION_CREATED'],conditions:JSON.stringify([{field:'description',operator:'contains',value:'Salário'},{field:'amount',operator:'greater_than',value:5000}]),actions:JSON.stringify([{type:'allocate_percent',params:{toAccountId:poup.id,percentage:20}}]),triggerCount:3},
  ]});

  const sess = await prisma.chatSession.create({data:{tenantId:t1.id,userId:u1.id,title:'Gastos delivery'}});
  await prisma.chatMessage.createMany({data:[
    {sessionId:sess.id,role:'USER',content:'Quanto gastei com iFood esse mês?',createdAt:ago(6)},
    {sessionId:sess.id,role:'ASSISTANT',content:'iFood julho: R$ 155,70. Junho: R$ 234,60. Redução de 33,7%!',metadata:{model:'llama3'},createdAt:ago(6)},
  ]});

  await prisma.tenant.create({data:{name:'Demo',slug:'demo',plan:'FREE',isActive:true}});

  console.log('\n' + '='.repeat(45));
  console.log('✅ SEED CONCLUÍDO!\n');
  console.log('  joao@exemplo.com / Senha@2025! (PRO)');
  console.log('  demo@fincontrol.app — tenant demo');
  console.log('='.repeat(45));
}

main().catch(e=>{console.error('❌',e);process.exit(1);}).finally(()=>prisma.$disconnect());