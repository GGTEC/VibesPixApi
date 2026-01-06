# Copilot Instructions for VibesPixApi

## Visão Geral da Arquitetura
- **Backend Node.js/Express**: Código principal em `src/app.js`, com handlers organizados em subpastas (`handlers/`, `services/`, `utils/`).
- **Frontend**: Arquivos estáticos em `public/` e subdiretórios de `src/` (ex: `home/`, `loja/`, `goal/`).
- **Configurações**: Centralizadas em `src/config/config.js`.
- **Integrações**: Handlers para Stripe, TTS, upload, SSE, webhooks, etc. em `src/handlers/`.

## Fluxos de Desenvolvimento
- **Rodar o servidor**: Use `node server.js` na raiz do projeto.
- **Dependências**: Gerenciadas via `package.json`. Instale com `npm install`.
- **Testes**: Testes Python em `test.py` (executar manualmente). Não há suíte de testes Node documentada.
- **Debug**: O entrypoint é `server.js`. Handlers e utilitários são modulares e podem ser testados isoladamente.

## Padrões e Convenções
- **Modularização**: Cada domínio (checkout, upload, TTS, etc.) tem seu handler dedicado em `src/handlers/`.
- **Configuração**: Não duplique configs; use sempre `src/config/config.js`.
- **Estáticos**: Use `public/` para assets globais e subpastas de `src/` para páginas específicas.
- **Rotas**: Definidas em `src/app.js` e delegadas para handlers.
- **Sem TypeScript**: O projeto é JavaScript puro.

## Integrações e Dependências
- **Stripe**: Handlers em `src/handlers/checkoutHandlers.js`.
- **TTS**: Handlers em `src/handlers/ttsHandlers.js`.
- **SSE**: Implementado em `src/handlers/sseHandlers.js`.
- **Uploads**: `src/handlers/uploadHandlers.js`.
- **Webhooks**: `src/handlers/webhookHandlers.js`.

## Exemplos de Padrão
- Para adicionar um novo domínio, crie um handler em `src/handlers/` e registre a rota em `src/app.js`.
- Para acessar configs, sempre importe de `src/config/config.js`.

## Outras Observações
- Não há instruções Copilot prévias ou regras de agentes encontradas.
- Não há README documentando comandos customizados.

---

Seções pouco claras ou incompletas? Peça feedback para expandir fluxos, integrações ou padrões específicos.