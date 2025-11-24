const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Configurações
const CONFIG = {
  perfisValidos: ['Admin', 'Operador'],
  statusValidos: ['Ativo', 'Inativo'],
  bcryptRounds: 10,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  jwtSecret: process.env.JWT_SECRET || 'seuSegredoJWT_fortissimo_aqui'
};

// Validações robustas
const Validacoes = {
  email: (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  },
  
  cpf: (cpf) => {
    if (!cpf) return false;
    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) return false;
    
    // Validação de dígitos do CPF
    if (/^(\d)\1{10}$/.test(cpfLimpo)) return false;
    
    let soma = 0;
    for (let i = 0; i < 9; i++) {
      soma += parseInt(cpfLimpo.charAt(i)) * (10 - i);
    }
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpfLimpo.charAt(9))) return false;
    
    soma = 0;
    for (let i = 0; i < 10; i++) {
      soma += parseInt(cpfLimpo.charAt(i)) * (11 - i);
    }
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    
    return resto === parseInt(cpfLimpo.charAt(10));
  },
  
  telefone: (telefone) => {
    if (!telefone) return false;
    const telefoneLimpo = telefone.replace(/\D/g, '');
    return telefoneLimpo.length >= 10 && telefoneLimpo.length <= 11;
  },
  
  dataNascimento: (data) => {
    if (!data) return false;
    
    // 🔥 CORREÇÃO: Remove validação de idade mínima
    // Aceita qualquer data válida, independente da idade
    const dataObj = new Date(data);
    return !isNaN(dataObj.getTime());
  },
  
  senha: (senha) => {
    return senha && senha.length >= 6;
  },
  
  nome: (nome) => {
    return nome && nome.trim().length >= 2 && nome.trim().length <= 255;
  }
};

// Utilitários
const Utils = {
  formatarData: (data, tipo = 'completa') => {
    if (!data) return null;
    try {
      const dataObj = new Date(data);
      if (isNaN(dataObj.getTime())) return null;
      
      if (tipo === 'nascimento') {
        // 🔥 CORREÇÃO: Formato DD-MM-YYYY
        const dia = String(dataObj.getDate()).padStart(2, '0');
        const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
        const ano = dataObj.getFullYear();
        return `${dia}-${mes}-${ano}`;
      }
      
      return dataObj.toLocaleString('pt-BR', { 
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short'
      });
    } catch (error) {
      return null;
    }
  },
  
  formatarUsuario: (usuario) => {
    if (!usuario) return null;
    
    const { senha, ...usuarioSemSenha } = usuario;
    return {
      ...usuarioSemSenha,
      dataNascimento: Utils.formatarData(usuario.dataNascimento, 'nascimento'),
      criadoEm: Utils.formatarData(usuario.criadoEm),
      atualizadoEm: Utils.formatarData(usuario.atualizadoEm)
    };
  },
  
  validarDadosUsuario: (dados, isUpdate = false) => {
    const errors = [];
    
    // Validações para criação
    if (!isUpdate) {
      if (!Validacoes.nome(dados.nome)) {
        errors.push('Nome é obrigatório e deve ter entre 2 e 255 caracteres');
      }
      if (!dados.email || !Validacoes.email(dados.email)) {
        errors.push('Email é obrigatório e deve ter formato válido');
      }
      if (!dados.senha || !Validacoes.senha(dados.senha)) {
        errors.push('Senha é obrigatória e deve ter pelo menos 6 caracteres');
      }
      if (!dados.telefone || !Validacoes.telefone(dados.telefone)) {
        errors.push('Telefone é obrigatório e deve ter formato válido');
      }
      if (!dados.cpf || !Validacoes.cpf(dados.cpf)) {
        errors.push('CPF é obrigatório e deve ser válido');
      }
      // 🔥 CORREÇÃO: Remove mensagem de idade mínima
      if (!dados.dataNascimento || !Validacoes.dataNascimento(dados.dataNascimento)) {
        errors.push('Data de nascimento é obrigatória e deve ser uma data válida');
      }
    } else {
      // Validações para atualização
      if (dados.nome && !Validacoes.nome(dados.nome)) {
        errors.push('Nome deve ter entre 2 e 255 caracteres');
      }
      if (dados.email && !Validacoes.email(dados.email)) {
        errors.push('Email deve ter formato válido');
      }
      if (dados.senha && !Validacoes.senha(dados.senha)) {
        errors.push('Senha deve ter pelo menos 6 caracteres');
      }
      if (dados.telefone && !Validacoes.telefone(dados.telefone)) {
        errors.push('Telefone deve ter formato válido');
      }
      if (dados.cpf && !Validacoes.cpf(dados.cpf)) {
        errors.push('CPF deve ser válido');
      }
      // 🔥 CORREÇÃO: Remove validação de idade mínima
      if (dados.dataNascimento && !Validacoes.dataNascimento(dados.dataNascimento)) {
        errors.push('Data de nascimento deve ser válida');
      }
    }
    
    // Validações específicas
    if (dados.perfil && !CONFIG.perfisValidos.includes(dados.perfil)) {
      errors.push(`Perfil deve ser um dos: ${CONFIG.perfisValidos.join(', ')}`);
    }
    
    if (dados.status && !CONFIG.statusValidos.includes(dados.status)) {
      errors.push(`Status deve ser um dos: ${CONFIG.statusValidos.join(', ')}`);
    }
    
    return errors;
  },
  
  verificarDuplicatas: async (dados, idExcluir = null) => {
    try {
      const conditions = [];
      
      if (dados.email) {
        conditions.push({ email: dados.email });
      }
      if (dados.cpf) {
        conditions.push({ cpf: dados.cpf });
      }
      if (dados.telefone) {
        conditions.push({ telefone: dados.telefone });
      }
      
      if (conditions.length === 0) return null;
      
      const where = { OR: conditions };
      
      if (idExcluir) {
        where.NOT = { id: idExcluir };
      }
      
      return await prisma.usuario.findFirst({ where });
    } catch (error) {
      throw new Error(`Erro ao verificar duplicatas: ${error.message}`);
    }
  },

  // 🔥 NOVO: Converter data do formato DD-MM-YYYY para Date object
  converterDataParaBackend: (dataString) => {
    if (!dataString) return null;
    
    try {
      // Se já é um objeto Date, retorna diretamente
      if (dataString instanceof Date) return dataString;
      
      // Tenta converter do formato DD-MM-YYYY
      if (typeof dataString === 'string' && dataString.includes('-')) {
        const partes = dataString.split('-');
        if (partes.length === 3) {
          const [dia, mes, ano] = partes;
          // Cria data no formato YYYY-MM-DD (ISO)
          return new Date(`${ano}-${mes}-${dia}`);
        }
      }
      
      // Tenta converter como está (formato nativo do input date)
      return new Date(dataString);
    } catch (error) {
      console.error('Erro ao converter data:', error);
      return null;
    }
  }
};

// Middleware de erro centralizado
const handleError = (res, error, context) => {
  console.error(`Erro em ${context}:`, error);
  
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return res.status(409).json({
          success: false,
          error: 'Conflito de dados',
          message: 'Já existe um usuário com esses dados únicos'
        });
      case 'P2025':
        return res.status(404).json({
          success: false,
          error: 'Não encontrado',
          message: 'Usuário não encontrado'
        });
      default:
        return res.status(400).json({
          success: false,
          error: 'Erro de banco de dados',
          message: error.message
        });
    }
  }
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Dados inválidos',
      message: error.message
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
  });
};

// Controladores
const UsuarioController = {
  // Criar novo usuário
  create: async (req, res) => {
    try {
      const dados = req.body;
      
      // 🔥 CORREÇÃO: Converte data antes da validação
      if (dados.dataNascimento) {
        dados.dataNascimento = Utils.converterDataParaBackend(dados.dataNascimento);
        if (!dados.dataNascimento) {
          return res.status(400).json({
            success: false,
            error: 'Data inválida',
            message: 'Formato de data deve ser DD-MM-YYYY'
          });
        }
      }
      
      // Validar dados
      const errors = Utils.validarDadosUsuario(dados);
      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Dados inválidos',
          details: errors
        });
      }
      
      // Verificar duplicatas
      const duplicata = await Utils.verificarDuplicatas(dados);
      if (duplicata) {
        return res.status(409).json({
          success: false,
          error: 'Dados em uso',
          message: 'Email, telefone ou CPF já está em uso'
        });
      }
      
      // Preparar dados
      const dadosCriacao = {
        ...dados,
        senha: await bcrypt.hash(dados.senha, CONFIG.bcryptRounds),
        perfil: CONFIG.perfisValidos.includes(dados.perfil) ? dados.perfil : 'Operador',
        status: CONFIG.statusValidos.includes(dados.status) ? dados.status : 'Ativo'
        // dataNascimento já foi convertida acima
      };
      
      // Criar usuário
      const usuario = await prisma.usuario.create({
        data: dadosCriacao,
        select: {
          id: true, nome: true, email: true, telefone: true, cpf: true,
          perfil: true, status: true, dataNascimento: true,
          criadoEm: true, atualizadoEm: true
        }
      });
      
      res.status(201).json({
        success: true,
        message: 'Usuário criado com sucesso',
        data: Utils.formatarUsuario(usuario)
      });
      
    } catch (error) {
      handleError(res, error, 'create usuario');
    }
  },
  
  // Listar todos os usuários
  read: async (req, res) => {
    try {
      const { page = 1, limit = 10, search, perfil, status } = req.query;
      
      const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit));
      const take = Math.min(100, parseInt(limit));
      
      // Construir filtros
      const where = {};
      
      if (search) {
        where.OR = [
          { nome: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ];
      }
      
      if (perfil && CONFIG.perfisValidos.includes(perfil)) {
        where.perfil = perfil;
      }
      
      if (status && CONFIG.statusValidos.includes(status)) {
        where.status = status;
      }
      
      const [usuarios, total] = await Promise.all([
        prisma.usuario.findMany({
          where,
          skip,
          take,
          select: {
            id: true, nome: true, email: true, telefone: true, cpf: true,
            perfil: true, status: true, dataNascimento: true,
            criadoEm: true, atualizadoEm: true
          },
          orderBy: { criadoEm: 'desc' }
        }),
        prisma.usuario.count({ where })
      ]);
      
      res.json({
        success: true,
        data: usuarios.map(Utils.formatarUsuario),
        pagination: {
          page: parseInt(page),
          limit: take,
          total,
          totalPages: Math.ceil(total / take)
        }
      });
      
    } catch (error) {
      handleError(res, error, 'read usuarios');
    }
  },
  
  // Buscar usuário por ID
  readOne: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          error: 'ID inválido',
          message: 'O ID deve ser um número positivo'
        });
      }
      
      const usuario = await prisma.usuario.findUnique({
        where: { id },
        select: {
          id: true, nome: true, email: true, telefone: true, cpf: true,
          perfil: true, status: true, dataNascimento: true,
          criadoEm: true, atualizadoEm: true
        }
      });
      
      if (!usuario) {
        return res.status(404).json({
          success: false,
          error: 'Não encontrado',
          message: 'Usuário não encontrado'
        });
      }
      
      res.json({
        success: true,
        data: Utils.formatarUsuario(usuario)
      });
      
    } catch (error) {
      handleError(res, error, 'readOne usuario');
    }
  },
  
  // Atualizar usuário
  update: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          error: 'ID inválido',
          message: 'O ID deve ser um número positivo'
        });
      }
      
      const dados = req.body;
      
      // 🔥 CORREÇÃO: Converte data antes da validação
      if (dados.dataNascimento) {
        dados.dataNascimento = Utils.converterDataParaBackend(dados.dataNascimento);
        if (!dados.dataNascimento) {
          return res.status(400).json({
            success: false,
            error: 'Data inválida',
            message: 'Formato de data deve ser DD-MM-YYYY'
          });
        }
      }
      
      // Validar dados
      const errors = Utils.validarDadosUsuario(dados, true);
      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Dados inválidos',
          details: errors
        });
      }
      
      // Verificar se usuário existe
      const usuarioExistente = await prisma.usuario.findUnique({
        where: { id },
        select: { id: true }
      });
      
      if (!usuarioExistente) {
        return res.status(404).json({
          success: false,
          error: 'Não encontrado',
          message: 'Usuário não encontrado'
        });
      }
      
      // Verificar duplicatas
      const duplicata = await Utils.verificarDuplicatas(dados, id);
      if (duplicata) {
        return res.status(409).json({
          success: false,
          error: 'Dados em uso',
          message: 'Email, telefone ou CPF já está em uso por outro usuário'
        });
      }
      
      // Preparar dados para atualização
      const dadosAtualizacao = { ...dados, atualizadoEm: new Date() };
      
      if (dadosAtualizacao.senha) {
        dadosAtualizacao.senha = await bcrypt.hash(dados.senha, CONFIG.bcryptRounds);
      }
      
      // Remover campos undefined
      Object.keys(dadosAtualizacao).forEach(key => {
        if (dadosAtualizacao[key] === undefined) {
          delete dadosAtualizacao[key];
        }
      });
      
      const usuarioAtualizado = await prisma.usuario.update({
        where: { id },
        data: dadosAtualizacao,
        select: {
          id: true, nome: true, email: true, telefone: true, cpf: true,
          perfil: true, status: true, dataNascimento: true,
          criadoEm: true, atualizadoEm: true
        }
      });
      
      res.json({
        success: true,
        message: 'Usuário atualizado com sucesso',
        data: Utils.formatarUsuario(usuarioAtualizado)
      });
      
    } catch (error) {
      handleError(res, error, 'update usuario');
    }
  },
  
  // Deletar usuário
  remove: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          error: 'ID inválido',
          message: 'O ID deve ser um número positivo'
        });
      }
      
      // Verificar se usuário existe e tem relacionamentos
      const usuario = await prisma.usuario.findUnique({
        where: { id },
        include: {
          clientes: { take: 1 },
          vendas: { take: 1 }
        }
      });
      
      if (!usuario) {
        return res.status(404).json({
          success: false,
          error: 'Não encontrado',
          message: 'Usuário não encontrado'
        });
      }
      
      // Verificar relacionamentos
      if (usuario.clientes.length > 0 || usuario.vendas.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Conflito',
          message: 'Não é possível deletar usuário com clientes ou vendas associadas',
          details: {
            totalClientes: usuario.clientes.length,
            totalVendas: usuario.vendas.length
          }
        });
      }
      
      await prisma.usuario.delete({ where: { id } });
      
      res.json({
        success: true,
        message: 'Usuário deletado com sucesso',
        data: { id } 
      });
      
    } catch (error) {
      handleError(res, error, 'remove usuario');
    }
  },
  
  // Login
  loginUser: async (req, res) => {
    console.log('Chamando loginUser');
    try {
      const { email, senha } = req.body;
      
      if (!email || !senha) {
        return res.status(400).json({
          success: false,
          error: 'Dados incompletos',
          message: 'Email e senha são obrigatórios'
        });
      }
      
      if (!Validacoes.email(email)) {
        return res.status(400).json({
          success: false,
          error: 'Email inválido',
          message: 'Formato de email inválido'
        });
      }
      
      const usuario = await prisma.usuario.findUnique({
        where: { email }
      });
      
      if (!usuario) {
        return res.status(401).json({
          success: false,
          error: 'Credenciais inválidas',
          message: 'Email ou senha incorretos'
        });
      }
      
      // Verificar senha
      const senhaValida = await bcrypt.compare(senha, usuario.senha);
      if (!senhaValida) {
        return res.status(401).json({
          success: false,
          error: 'Credenciais inválidas',
          message: 'Email ou senha incorretos'
        });
      }
      
      // Verificar status
      if (usuario.status !== 'Ativo') {
        return res.status(403).json({
          success: false,
          error: 'Usuário inativo',
          message: `Usuário com status "${usuario.status}" não pode fazer login`
        });
      }
      
      // Gerar token
      const token = jwt.sign(
        { 
          id: usuario.id, 
          email: usuario.email, 
          perfil: usuario.perfil 
        },
        CONFIG.jwtSecret,
        { expiresIn: CONFIG.jwtExpiresIn }
      );
      
      // Atualizar último acesso
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { atualizadoEm: new Date() }
      });
      
      res.json({
        success: true,
        message: 'Login realizado com sucesso',
        data: {
          token,
          usuario: {
            id: usuario.id,
            nome: usuario.nome,
            email: usuario.email,
            perfil: usuario.perfil,
            status: usuario.status
          },
          expiresIn: CONFIG.jwtExpiresIn
        }
      });
      
    } catch (error) {
      handleError(res, error, 'loginUser');
    }
  }
};

module.exports = UsuarioController;