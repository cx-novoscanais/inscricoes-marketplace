const processUrl='https://oklzhsljbqjfpxmgpcfz.supabase.co/functions/v1/marketplace-process';
const $=id=>document.getElementById(id);

const canal=$('canal');
const arquivo=$('arquivo');
const opkey=$('opkey');
const validar=$('validar');
const oferta=$('oferta');
const enviar=$('enviar');
const resumo=$('resumo');
const total=$('total');
const prontos=$('prontos');
const erros=$('erros');
const tbody=$('tbody');
const dmhBox=$('dmhBox');
const dmhResult=$('dmhResult');
const finalBox=$('finalBox');
const finalResult=$('finalResult');
const raw=$('raw');
const statusId=$('statusId');
const statusCpf=$('statusCpf');
const consultarStatus=$('consultarStatus');
const atualizarTodos=$('atualizarTodos');
const statusMessage=$('statusMessage');
const statusTbody=$('statusTbody');

let channels=[
[99,'Vai de bolsa - Marketplace'],[97,'Digdu - Marketplace'],[96,'Vou de bolsa - Marketplace'],
[94,'Amigo edu - Marketplace'],[98,'Quero bolsa - Marketplace'],[95,'Educa mais brasil - Marketplace'],
[127,'Casa do Universitário - Marketplace'],[113,'Edupass - Marketplace'],[114,'Neora - Marketplace'],
[120,'Elleve - Marketplace'],[139,'Infinity - Marketplace'],[140,'Galati - Marketplace'],
[141,'Inovit - Marketplace'],[146,'Bolsa Convênio Empresa C/ Garantia - Marketplace'],[124,'Bolsa mais brasil - Marketplace'],[155,'Único Skill - Marketplace'],
[156,'Pravaler - Marketplace'],[157,'Faça Acontecer (SICOB) - Marketplace'],
[158,'Ficou Fácil (Santander) - Marketplace'],[159,'Instituto FEPAF - Marketplace'],
[160,'Conect Car - Marketplace'],[162,'Omverso - Marketplace']
];

function populateChannels(){
  const current=canal.value;
  canal.innerHTML=channels
    .slice()
    .sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'pt-BR'))
    .map(x=>'<option value="'+x[0]+'">'+x[1]+' — '+x[0]+'</option>')
    .join('');
  if(current && channels.some(x=>String(x[0])===String(current))) canal.value=current;
}

async function loadChannels(){
  populateChannels();
  try{
    const res=await fetch(processUrl,{method:'GET',cache:'no-store'});
    const data=await res.json();
    if(Array.isArray(data.channels) && data.channels.length){
      channels=data.channels.map(x=>[Number(x.id),String(x.name)]);
      populateChannels();
    }
  }catch(err){
    console.warn('Usando lista local de canais:',err);
  }
}

loadChannels();

const required=[
'cpf','nome','rg','anoConclusaoEnsinoMedio','sexo','celular','dataNascimento','email',
'logradouro','numero','cep','uf','municipio','businessKeyOferta','tipoIngresso',
'aceiteTermo','aceitaReceberEmail','aceitaReceberSMS','aceitaReceberWhatsApp'
];

const TRACKING_KEY='marketplace_tracking_v2';
let validRows=[];
let trackingRows=loadTracking();
let refreshInProgress=false;

renderTracking();

validar.onclick=()=>{
  if(!arquivo.files[0]) return alert('Selecione uma planilha.');
  const rd=new FileReader();

  rd.onload=e=>{
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      const ws=wb.Sheets['MODELO_GRADUACAO']||wb.Sheets[wb.SheetNames[0]];
      const dataRows=XLSX.utils.sheet_to_json(ws,{defval:''});
      validRows=[];
      let bad=0;

      tbody.innerHTML=dataRows.map((r,i)=>{
        const miss=required.filter(k=>String(r[k]??'').trim()==='');
        const good=miss.length===0;

        if(good) validRows.push(r);
        else bad++;

        return '<tr>'+
          '<td>'+(i+2)+'</td>'+
          '<td>'+esc(r.cpf)+'</td>'+
          '<td>'+esc(r.nome)+'</td>'+
          '<td>'+esc(r.businessKeyOferta)+'</td>'+
          '<td>'+esc(r.diasDaSemanaSelecionado||'')+'</td>'+
          '<td class="'+(good?'ok':'bad')+'">'+(good?'PRONTO':'ERRO')+'</td>'+
          '<td>'+miss.map(x=>'Falta: '+esc(x)).join('<br>')+'</td>'+
        '</tr>';
      }).join('');

      total.textContent=dataRows.length;
      prontos.textContent=validRows.length;
      erros.textContent=bad;
      resumo.classList.remove('hidden');
      oferta.disabled=validRows.length!==1;
      dmhBox.classList.add('hidden');
      finalBox.classList.add('hidden');
      enviar.disabled=false;
      enviar.textContent='Descer inscrição em Produção';

      if(validRows.length===1 && !statusCpf.value){
        statusCpf.value=String(validRows[0].cpf||'');
      }

      if(validRows.length>1){
        alert('Para o primeiro teste, deixe somente 1 linha preenchida na planilha.');
      }
    }catch(err){
      alert('Erro ao ler a planilha: '+err.message);
    }
  };

  rd.readAsArrayBuffer(arquivo.files[0]);
};

oferta.onclick=async()=>{
  if(validRows.length!==1) return;
  if(!opkey.value) return alert('Digite a chave de operação.');

  oferta.disabled=true;
  oferta.textContent='Consultando DMH...';

  try{
    const r=await callApi('preview',validRows[0],opkey.value);
    const profile=r.credentialProfile==='GLOBAL'
      ? 'Credencial padrão da API'
      : 'Credencial específica do canal';

    const p=r.offer?.paymentOptions||{};
    const f=r.offer?.financial||{};

    const is155=Number(r.channel?.id||canal.value)===155;
    const exemption=r.priceValidation?.channel155FullExemption;

    dmhResult.innerHTML=
      '<p><b>Curso:</b> '+esc(r.offer?.name||'')+'</p>'+
      '<p><b>idDMH:</b> '+esc(r.offer?.idDMH||'')+'</p>'+
      '<p><b>Canal:</b> '+esc((r.channel?.name||'')+' — '+String(r.channel?.id||canal.value))+'</p>'+
      '<p><b>Tabela do canal:</b> <span class="ok">CONFIRMADA NO DMH</span></p>'+
      '<p><b>Oferta financeira:</b> <span class="ok">CONFIRMADA</span> — ID '+esc(f.id||'')+'</p>'+
      (is155
        ? '<div class="success"><b>Regra do canal 155 confirmada.</b><br>'+
          'Bolsa de isenção: 100%<br>'+
          'Todas as parcelas: ISENTAS<br>'+
          'Até o fim do curso: '+(exemption?.untilEndProgram?'SIM':'NÃO')+
          (exemption?.scholarshipDescription?'<br>Bolsa DMH: '+esc(exemption.scholarshipDescription):'')+
          '</div>'
        : '')+
      '<p><b>Preço base:</b> '+money(p.baseValue ?? f.baseValue)+'</p>'+
      '<p><b>Preço da oferta:</b> '+money(p.offerValue ?? f.offerValue)+'</p>'+
      '<p><b>Valor de matrícula:</b> '+money(p.enrollmentValue ?? f.enrollmentValue)+'</p>'+
      '<p><b>scheduleList:</b> '+esc(JSON.stringify(r.offer?.scheduleList||[]))+'</p>'+
      '<p class="muted"><b>Validação:</b> a oferta só é liberada para envio quando o canal selecionado está vinculado ao idDMH e existe oferta financeira correspondente.'+
      (is155?' Para o canal 155, também é obrigatório existir bolsa percentual de 100% até o fim do curso e todas as parcelas com valor líquido zero.':'')+
      '</p>';

    dmhBox.classList.remove('hidden');
    enviar.disabled=false;
    enviar.textContent='Descer inscrição em Produção';
  }catch(err){
    alert(err.message);
  }finally{
    oferta.disabled=false;
    oferta.textContent='Consultar oferta no DMH';
  }
};

enviar.onclick=async()=>{
  if(!opkey.value) return alert('Digite a chave de operação.');
  if(validRows.length!==1) return alert('Valide uma única inscrição antes de enviar.');
  if(!confirm('CONFIRMA a criação de 1 inscrição REAL em PRODUÇÃO no canal selecionado?')) return;

  let accepted=false;
  enviar.disabled=true;
  enviar.textContent='Enviando e acompanhando processamento...';

  try{
    const r=await callApi('submit',validRows[0],opkey.value);
    finalBox.classList.remove('hidden');

    const id=String(r.created?.id||r.created?.inscricao?.id||r.created?.idOrigem||'');
    const status=String(r.processing?.status||'PROCESSING').toUpperCase();
    const finished=Boolean(r.processing?.finished);
    const quoteReady=Boolean(r.processing?.quoteReady);
    const readyForNextStep=Boolean(r.processing?.readyForNextStep);
    accepted=Boolean(id);

    if(id){
      const track=r.tracking||{};
      upsertTracking({
        id,
        cpf:track.cpf||String(validRows[0].cpf||''),
        nome:track.nome||String(validRows[0].nome||''),
        canalId:track.canalId||Number(canal.value),
        canalNome:track.canalNome||channelName(Number(canal.value)),
        curso:track.curso||'',
        businessKeyOferta:track.businessKeyOferta||String(validRows[0].businessKeyOferta||''),
        status,
        finished,
        quoteReady,
        readyForNextStep,
        quote:r.processing?.quote||null,
        createdAt:track.createdAt||new Date().toISOString(),
        checkedAt:new Date().toISOString()
      });

      statusId.value=id;
      statusCpf.value=track.cpf||String(validRows[0].cpf||'');
    }

    if(readyForNextStep){
      finalResult.innerHTML=
        '<div class="success"><b>Inscrição concluída e cotação gerada.</b><br>'+
        'ID: '+esc(id)+'<br>'+
        'Canal: '+esc((r.channel?.name||'')+' — '+String(r.channel?.id||''))+'<br>'+
        'Status de processamento: SUCCESS<br>'+
        'Cotação: GERADA'+quoteSummary(r.processing?.quote)+'</div>';
    }else if(status==='SUCCESS' && !quoteReady){
      finalResult.innerHTML=
        '<div class="warn"><b>Inscrição concluída, mas a cotação ainda não apareceu.</b><br>'+
        'ID: '+esc(id)+'<br>'+
        'Status: SUCCESS<br>'+
        'Não faça a próxima etapa ainda. Use o acompanhamento abaixo até a cotação ficar como GERADA.</div>';
    }else if(finished){
      finalResult.innerHTML=
        '<div class="error"><b>A inscrição foi recebida, mas o processamento terminou com erro.</b><br>'+
        'ID: '+esc(id)+'<br>'+
        'Status: '+esc(status)+'</div>';
    }else{
      finalResult.innerHTML=
        '<div class="warn"><b>Inscrição enviada e ainda em processamento.</b><br>'+
        'ID: '+esc(id)+'<br>'+
        'Status atual: '+esc(status)+'<br>'+
        'Ela já foi adicionada ao painel de acompanhamento abaixo. Não envie novamente.</div>';
    }

    raw.textContent=JSON.stringify(r,null,2);
    renderTracking();
    document.getElementById('trackingBox')?.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(err){
    finalBox.classList.remove('hidden');
    finalResult.innerHTML='<div class="error"><b>Falha:</b> '+esc(err.message)+'</div>';
    raw.textContent=err.raw||'';
  }finally{
    if(accepted){
      enviar.disabled=true;
      enviar.textContent='Inscrição enviada — acompanhe o status';
    }else{
      enviar.disabled=false;
      enviar.textContent='Descer inscrição em Produção';
    }
  }
};

consultarStatus.onclick=async()=>{
  const id=String(statusId.value||'').trim();
  const cpf=String(statusCpf.value||'').trim();

  if(!opkey.value) return alert('Digite a chave de operação no campo acima.');
  if(!id) return alert('Informe o ID da inscrição.');
  if(!cpf) return alert('Informe também o CPF para tornar a consulta mais confiável.');

  await refreshOne(id,cpf,true);
};

atualizarTodos.onclick=async()=>{
  if(!opkey.value) return alert('Digite a chave de operação no campo acima.');

  const pending=trackingRows.filter(x=>!isFinalStatus(x.status));
  if(!pending.length){
    showStatusMessage('Não há inscrições pendentes para atualizar.');
    return;
  }

  atualizarTodos.disabled=true;
  atualizarTodos.textContent='Atualizando...';

  try{
    for(const item of pending){
      await refreshOne(item.id,item.cpf,false);
    }
    showStatusMessage('Atualização concluída para '+pending.length+' inscrição(ões).');
  }finally{
    atualizarTodos.disabled=false;
    atualizarTodos.textContent='Atualizar pendentes';
  }
};

statusTbody.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-status-id]');
  if(!btn) return;
  if(!opkey.value) return alert('Digite a chave de operação no campo acima.');

  const id=btn.getAttribute('data-status-id');
  const item=trackingRows.find(x=>String(x.id)===String(id));
  if(!item) return;

  btn.disabled=true;
  btn.textContent='Consultando...';
  try{
    await refreshOne(item.id,item.cpf,true);
  }finally{
    btn.disabled=false;
    btn.textContent='Consultar';
  }
});

async function refreshOne(id,cpf,showMessage){
  try{
    const r=await callApi('status',null,opkey.value,{enrollmentId:String(id),cpf:String(cpf||'')});
    const status=String(r.processing?.status||'PROCESSING').toUpperCase();
    const data=r.processing?.data||null;
    const info=extractInfo(data);
    const quoteReady=Boolean(r.processing?.quoteReady);
    const readyForNextStep=Boolean(r.processing?.readyForNextStep);

    upsertTracking({
      id:String(id),
      cpf:String(cpf||info.cpf||''),
      nome:info.nome||'',
      canalId:info.canalId||'',
      canalNome:info.canalNome||'',
      curso:info.curso||'',
      status,
      finished:Boolean(r.processing?.finished),
      quoteReady,
      readyForNextStep,
      quote:r.processing?.quote||null,
      checkedAt:r.checkedAt||new Date().toISOString()
    });

    renderTracking();

    if(showMessage){
      if(readyForNextStep){
        showStatusMessage('Inscrição '+id+' concluída com SUCCESS e cotação GERADA. Pronta para a próxima etapa.');
      }else if(status==='SUCCESS' && !quoteReady){
        showStatusMessage('Inscrição '+id+' está SUCCESS, mas ainda SEM COTAÇÃO. Não avance para a próxima etapa.');
      }else if(isFinalStatus(status)){
        showStatusMessage('Inscrição '+id+' finalizada com status '+status+'.');
      }else{
        showStatusMessage('Inscrição '+id+' continua em '+status+'. O sistema seguirá permitindo novas consultas sem reenviar a inscrição.');
      }
    }

    return r;
  }catch(err){
    if(showMessage) showStatusMessage('Não foi possível consultar o ID '+id+': '+err.message,true);
    throw err;
  }
}

function extractInfo(data){
  if(!data) return {};
  const item=Array.isArray(data)?data[0]:data;
  const ins=item?.inscricao||item||{};
  const dp=item?.dadosPessoais||ins?.dadosPessoais||{};
  const opcao=ins?.ofertas?.primeiraOpcao||{};

  return {
    cpf:dp?.cpf||'',
    nome:dp?.nome||'',
    canalId:ins?.canalVendas?.id||'',
    canalNome:channelName(Number(ins?.canalVendas?.id||0)),
    curso:opcao?.dsCurso||opcao?.name||''
  };
}

function upsertTracking(entry){
  const id=String(entry.id||'').trim();
  if(!id) return;

  const old=trackingRows.find(x=>String(x.id)===id)||{};
  const merged={
    ...old,
    ...Object.fromEntries(Object.entries(entry).filter(([,v])=>v!==''&&v!==null&&v!==undefined)),
    id
  };

  const idx=trackingRows.findIndex(x=>String(x.id)===id);
  if(idx>=0) trackingRows[idx]=merged;
  else trackingRows.unshift(merged);

  trackingRows=trackingRows.slice(0,100);
  localStorage.setItem(TRACKING_KEY,JSON.stringify(trackingRows));
}

function loadTracking(){
  try{
    const data=JSON.parse(localStorage.getItem(TRACKING_KEY)||'[]');
    return Array.isArray(data)?data:[];
  }catch{
    return [];
  }
}

function renderTracking(){
  if(!trackingRows.length){
    statusTbody.innerHTML='<tr><td colspan="8" class="muted">Nenhuma inscrição acompanhada neste navegador. Você pode informar um ID e CPF acima para consultar uma inscrição já existente.</td></tr>';
    return;
  }

  statusTbody.innerHTML=trackingRows.map(item=>{
    const status=String(item.status||'PROCESSING').toUpperCase();
    return '<tr>'+
      '<td class="nowrap"><b>'+esc(item.id)+'</b></td>'+
      '<td class="nowrap">'+esc(item.cpf||'')+'</td>'+
      '<td>'+esc(item.nome||'')+'</td>'+
      '<td>'+esc(item.canalNome||item.canalId||'')+'</td>'+
      '<td>'+esc(item.curso||'')+'</td>'+
      '<td>'+statusBadge(status)+'<br>'+quoteBadge(item.quoteReady,item.status)+'</td>'+
      '<td class="nowrap">'+esc(formatDateTime(item.checkedAt||item.createdAt))+'</td>'+
      '<td><button class="mini-btn secondary" data-status-id="'+esc(item.id)+'">Consultar</button></td>'+
    '</tr>';
  }).join('');
}

function quoteBadge(quoteReady,status){
  const s=String(status||'').toUpperCase();
  if(quoteReady) return '<span class="status-pill status-success">COTAÇÃO GERADA</span>';
  if(s==='SUCCESS') return '<span class="status-pill status-error">SEM COTAÇÃO</span>';
  return '<span class="status-pill status-unknown">COTAÇÃO PENDENTE</span>';
}

function quoteSummary(quote){
  if(!quote || typeof quote!=='object') return '';
  const parts=[];
  if(quote.orderReference) parts.push('Ref.: '+esc(quote.orderReference));
  if(quote.tipoSimulacao) parts.push('Tipo: '+esc(quote.tipoSimulacao));
  if(quote.dataGeracao) parts.push('Gerada em: '+esc(quote.dataGeracao));
  return parts.length?'<br>'+parts.join(' • '):'';
}

function money(v){
  const n=Number(v);
  if(!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}

function statusBadge(status){
  const s=String(status||'').toUpperCase();
  let cls='status-unknown';
  if(s==='SUCCESS') cls='status-success';
  else if(['PROCESSING','PENDING','IN_PROCESS','INPROCESS'].includes(s)) cls='status-processing';
  else if(isFinalStatus(s)) cls='status-error';

  return '<span class="status-pill '+cls+'">'+esc(s||'SEM STATUS')+'</span>';
}

function isFinalStatus(status){
  return ['SUCCESS','ERROR','FAILED','FAILURE','CANCELLED','CANCELED'].includes(String(status||'').toUpperCase());
}

function showStatusMessage(message,isError=false){
  statusMessage.textContent=message;
  statusMessage.classList.remove('hidden');
  statusMessage.style.borderColor=isError?'#fecdca':'#d7e3f3';
  statusMessage.style.background=isError?'#fef3f2':'#f8fbff';
  statusMessage.style.color=isError?'#b42318':'#344054';
}

function channelName(id){
  return channels.find(x=>Number(x[0])===Number(id))?.[1]||'';
}

function formatDateTime(value){
  if(!value) return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR');
}

async function callApi(action,row,key,extra={}){
  const body={action,...extra};
  if(row) body.row=row;
  if(action!=='status') body.channelId=Number(canal.value);

  const res=await fetch(processUrl,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-operator-key':key
    },
    body:JSON.stringify(body)
  });

  const responseText=await res.text();
  let j={};

  try{
    j=JSON.parse(responseText);
  }catch{
    j={error:responseText};
  }

  if(!res.ok||j.ok===false||j.error){
    const err=new Error(j.error||('HTTP '+res.status));
    err.raw=responseText;
    throw err;
  }

  return j;
}

function esc(v){
  return String(v??'').replace(/[&<>"']/g,m=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[m]));
}

setInterval(async()=>{
  if(document.visibilityState!=='visible'||refreshInProgress||!opkey.value) return;

  const pending=trackingRows.filter(x=>!isFinalStatus(x.status));
  if(!pending.length) return;

  refreshInProgress=true;
  try{
    for(const item of pending.slice(0,10)){
      try{ await refreshOne(item.id,item.cpf,false); }catch{}
    }
  }finally{
    refreshInProgress=false;
  }
},30000);
