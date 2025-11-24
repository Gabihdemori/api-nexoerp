# API NexoERP

## Tecnologias
- Node.js
- JavaScript
- VsCode
- Prisma
- XAMPP (MySQL)
- Vercel

## Passos para executar localmente
- 1 Clonar este repositorio
- 2 Abrir com VsCode e em um terminal CMD ou BASH instalar as dependências
```bash
npm install
```
- 3 Criar o arquivo .env contendo:
```env
DATABASE_URL="mysql://root@localhost:3306/NexoERPbanco?schema=public&timezone=UTC"
JWT_SECRET=uma_chave_muito_secreta_aqui
JWT_EXPIRES_IN=1h
```
- 4 Executar o XAMPP Controll Pannel e dar start em MySQL
- 5 Migrar o Banco de dados
```bash
npx prisma migrate dev --name init
npx prisma db seed
```
- 6 Executar a API
```bash
npm run dev
```
