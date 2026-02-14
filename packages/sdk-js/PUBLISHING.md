# Guia de Publicação - @xase/sdk-js

## 📦 Publicar no NPM

### Pré-requisitos

1. **Conta no NPM**
   - Criar conta em https://www.npmjs.com/signup
   - Verificar email

2. **Login no NPM**
   ```bash
   npm login
   ```
   
   Você será solicitado a fornecer:
   - Username
   - Password
   - Email
   - OTP (se 2FA estiver habilitado)

3. **Verificar login**
   ```bash
   npm whoami
   ```

---

## 🚀 Publicação

### 1. Verificar package.json

```bash
cat package.json
```

Certifique-se que:
- ✅ `name` está correto: `@xase/sdk-js`
- ✅ `version` está correto: `0.1.0`
- ✅ `description` está preenchida
- ✅ `main`, `module`, `types` estão corretos
- ✅ `files` inclui `dist`, `README.md`, `LICENSE`

---

### 2. Build

```bash
npm run build
```

Verificar que `dist/` foi criado com:
- `index.js` (CommonJS)
- `index.mjs` (ESM)
- `index.d.ts` (TypeScript)

---

### 3. Testar localmente

```bash
# Link local
npm link

# Em outro projeto
cd /path/to/test-project
npm link @xase/sdk-js

# Testar
node test.js
```

---

### 4. Publicar

```bash
npm publish --access public
```

**Nota:** `--access public` é necessário para pacotes scoped (@xase/...).

---

### 5. Verificar publicação

```bash
# Ver no npm
open https://www.npmjs.com/package/@xase/sdk-js

# Instalar em outro projeto
npm install @xase/sdk-js
```

---

## 🔄 Atualizar Versão

### Patch (0.1.0 → 0.1.1)
```bash
npm version patch
npm publish --access public
```

### Minor (0.1.0 → 0.2.0)
```bash
npm version minor
npm publish --access public
```

### Major (0.1.0 → 1.0.0)
```bash
npm version major
npm publish --access public
```

---

## 🛠️ Troubleshooting

### "need auth This command requires you to be logged in"

**Causa:** Não está logado no npm.

**Fix:**
```bash
npm login
```

---

### "You do not have permission to publish"

**Causa:** Nome do pacote já existe ou você não tem permissão.

**Fix:**
1. Escolher outro nome no `package.json`
2. Ou criar organização `@xase` no npm

---

### "package.json errors"

**Causa:** Erros no package.json.

**Fix:**
```bash
npm pkg fix
```

---

### "403 Forbidden"

**Causa:** Pacote scoped sem `--access public`.

**Fix:**
```bash
npm publish --access public
```

---

## 📋 Checklist de Publicação

Antes de publicar, verifique:

- [ ] `npm run build` funciona
- [ ] `dist/` contém todos os arquivos
- [ ] `README.md` está completo
- [ ] `LICENSE` existe
- [ ] `package.json` está correto
- [ ] Versão foi incrementada
- [ ] Testou localmente com `npm link`
- [ ] Logado no npm (`npm whoami`)
- [ ] Commit e push no Git

---

## 🔐 Configurar 2FA (Recomendado)

### 1. Habilitar 2FA

```bash
npm profile enable-2fa auth-and-writes
```

### 2. Publicar com OTP

```bash
npm publish --access public --otp=123456
```

---

## 📊 Após Publicação

### 1. Verificar no NPM

```
https://www.npmjs.com/package/@xase/sdk-js
```

### 2. Testar instalação

```bash
mkdir test-install
cd test-install
npm init -y
npm install @xase/sdk-js

# Testar
node -e "const { XaseClient } = require('@xase/sdk-js'); console.log('✅ SDK instalado!')"
```

### 3. Criar GitHub Release

```bash
git tag v0.1.0
git push origin v0.1.0
```

---

## 🎯 Alternativa: Publicação Manual (Sem Login)

Se não quiser publicar no npm público, você pode:

### 1. Usar como dependência local

```json
{
  "dependencies": {
    "@xase/sdk-js": "file:../packages/sdk-js"
  }
}
```

### 2. Usar npm link

```bash
cd packages/sdk-js
npm link

cd /path/to/your/project
npm link @xase/sdk-js
```

### 3. Publicar em registry privado

```bash
npm publish --registry https://your-private-registry.com
```

---

## 📝 Próximos Passos

Após publicar:

1. ✅ Atualizar README com badge do npm
2. ✅ Criar GitHub Release
3. ✅ Anunciar no Twitter/LinkedIn
4. ✅ Atualizar documentação
5. ✅ Monitorar downloads

---

## 🔗 Links Úteis

- **NPM Package:** https://www.npmjs.com/package/@xase/sdk-js
- **NPM Docs:** https://docs.npmjs.com/
- **Semantic Versioning:** https://semver.org/

---

**Status:** Pronto para publicação
**Versão:** 0.1.0
