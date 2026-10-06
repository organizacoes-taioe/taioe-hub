/* /conta/, a área «Meus dados» (PLANO, seção 8). */
(function () {
  'use strict';
  var H = TaioeHub, sb = TaioeSessao.cliente(), uid = null;
  var perfis = function () { return sb.schema('conta').from('perfis'); };

  TaioeSessao.aoSair(function () { location.replace('/'); });

  (async function () {
    var sessao = await H.sessaoAtual();
    if (!sessao) { TaioeSessao.irParaEntrar(); return; }
    uid = sessao.user.id;
    var perfil;
    try { perfil = await H.lerPerfil(); } catch (e) {
      H.$('carregando').textContent = H.mensagemDeErro(e);
      return;
    }
    if (!perfil) { location.replace('/entrar/cadastro/'); return; }
    H.$('email').textContent = sessao.user.email;
    H.$('nome').value = perfil.nome;
    H.$('calibragem').checked = perfil.fora_da_calibragem;
    H.mostrar('carregando', false);
    H.mostrar('conteudo', true);
  })();

  H.$('form-nome').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var nome = H.$('nome').value.trim().replace(/\s+/g, ' ');
    if (nome.length < 1 || nome.length > 40) { H.avisar('aviso-nome', 'O nome tem de 1 a 40 letras.', 'erro'); return; }
    var r = await perfis().update({ nome: nome }).eq('usuario_id', uid);
    H.avisar('aviso-nome', r.error ? H.mensagemDeErro(r.error) : 'Nome salvo.', r.error ? 'erro' : 'ok');
  });

  H.$('form-email').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var campo = H.$('novo-email'), novo = campo.value.trim().toLowerCase();
    if (!campo.checkValidity() || !novo) { H.avisar('aviso-email', 'Escreva um endereço de email válido.', 'erro'); return; }
    var r = await sb.auth.updateUser({ email: novo });
    H.avisar('aviso-email', r.error ? H.mensagemDeErro(r.error)
      : 'Pronto. Abra os dois emails de confirmação (no endereço atual e no novo) para concluir a troca.',
      r.error ? 'erro' : 'ok');
  });

  H.$('calibragem').addEventListener('change', async function () {
    var r = await perfis().update({ fora_da_calibragem: this.checked }).eq('usuario_id', uid);
    if (r.error) { this.checked = !this.checked; H.avisar('aviso-dados', H.mensagemDeErro(r.error), 'erro'); return; }
    H.avisar('aviso-dados', this.checked ? 'Suas respostas ficam fora da calibragem.' : 'Suas respostas voltam a ajudar a calibrar os baralhos, sem identificação.', 'ok');
  });

  H.$('baixar').addEventListener('click', async function () {
    H.avisar('aviso-dados', 'Preparando o arquivo…');
    var r = await sb.schema('conta').rpc('exportar_meus_dados');
    if (r.error) { H.avisar('aviso-dados', H.mensagemDeErro(r.error), 'erro'); return; }
    var blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'taioe-meus-dados-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
    H.avisar('aviso-dados', 'Arquivo baixado.', 'ok');
  });

  H.$('sair').addEventListener('click', async function () {
    if (H.$('apagar-local').checked) await H.apagarDadosDoAparelho();
    await TaioeSessao.sair(false);
    location.replace('/');
  });

  H.$('sair-todos').addEventListener('click', async function () {
    H.avisar('aviso-sair', 'Saindo de todos os aparelhos…');
    var apagar = H.$('apagar-local').checked;
    var ok = await TaioeSessao.sair(true);
    if (!ok) {
      H.avisar('aviso-sair', 'Não foi possível sair dos outros aparelhos. Tente de novo com internet.', 'erro');
      return;
    }
    if (apagar) await H.apagarDadosDoAparelho();
    location.replace('/');
  });
})();
