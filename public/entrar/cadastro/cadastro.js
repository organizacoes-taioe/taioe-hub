/* /entrar/cadastro/: na primeira vez, o nome e o aceite; depois de uma mudança dos termos ou
   da política, só o novo aceite. Nenhuma pergunta de idade (decisão de 26/09). */
(function () {
  'use strict';
  var H = TaioeHub, I = TaioeI18n, t = I.t, sb = TaioeSessao.cliente(), perfil = null, vig = null, uid = null;

  H.$('sair').addEventListener('click', async function () { await TaioeSessao.sair(false); location.replace('/'); });

  (async function () {
    var sessao = await H.sessaoAtual();
    if (!sessao) { TaioeSessao.irParaEntrar(); return; }
    uid = sessao.user.id;
    try {
      perfil = await H.lerPerfil();
      vig = await H.documentosVigentes();
    } catch (e) {
      H.mostrar('carregando', false);
      H.mostrar('form', true);
      H.avisar('aviso', H.mensagemDeErro(e), 'erro');
      return;
    }
    if (!vig.termos || !vig.politica) {
      I.marcar('carregando', 'cadastro.sem-termos');
      return;
    }
    if (perfil && perfil.termos_versao === vig.termos.id && perfil.politica_versao === vig.politica.id) {
      H.irAoDestino();                                     // nada a fazer aqui
      return;
    }
    H.linguaDoPerfil(perfil);
    H.$('email').textContent = sessao.user.email;
    I.marcar('aceite-texto', 'cadastro.aceite', { termos: vig.termos.url, politica: vig.politica.url }, true);
    I.marcar('versoes', 'cadastro.versoes', { termos: vig.termos.publicado_em, politica: vig.politica.publicado_em });
    if (perfil) {
      I.marcar('titulo', 'cadastro.h1-termos');
      H.mostrar('explica-novo-aceite', true);
      H.mostrar('bloco-nome', false);
    }
    H.mostrar('carregando', false);
    H.mostrar('form', true);
    (perfil ? H.$('aceite') : H.$('nome')).focus();
  })();

  H.$('form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var nome = H.$('nome').value.trim().replace(/\s+/g, ' ');
    if (!perfil && (nome.length < 1 || nome.length > 40)) {
      H.avisar('aviso', t('cadastro.nome-erro'), 'erro'); H.$('nome').focus(); return;
    }
    if (!H.$('aceite').checked) {
      H.avisar('aviso', t('cadastro.aceite-erro'), 'erro'); return;
    }
    H.$('salvar').disabled = true;
    H.avisar('aviso', t('comum.salvando'));
    var tabela = sb.schema('conta').from('perfis'), r;
    if (perfil) {
      r = await tabela.update({ termos_versao: vig.termos.id, politica_versao: vig.politica.id }).eq('usuario_id', uid);
    } else {
      r = await tabela.insert({ usuario_id: uid, nome: nome, termos_versao: vig.termos.id, politica_versao: vig.politica.id,
        lingua_interface: I.lingua() });                // a língua em que a pessoa se cadastrou
    }
    if (r.error) {
      H.$('salvar').disabled = false;
      H.avisar('aviso', /PT400|vigente|inválida/.test(r.error.message || '')
        ? t('cadastro.termos-mudaram') : H.mensagemDeErro(r.error), 'erro');
      return;
    }
    try { await sb.schema('conta').rpc('registrar_acesso', { app: 'hub' }); } catch (e) {}
    H.irAoDestino();
  });
})();
