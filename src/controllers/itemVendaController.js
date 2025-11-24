const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Função para validar dados do item de venda
 */
function validarItemVenda(dados, isUpdate = false) {
  const errors = [];

  // Validações para criação
  if (!isUpdate) {
    if (!dados.vendaId || isNaN(dados.vendaId)) {
      errors.push('vendaId é obrigatório e deve ser um número válido');
    }
    if (!dados.produtoId || isNaN(dados.produtoId)) {
      errors.push('produtoId é obrigatório e deve ser um número válido');
    }
  }

  // Validações específicas dos campos
  if (dados.quantidade !== undefined && (isNaN(dados.quantidade) || dados.quantidade <= 0)) {
    errors.push('Quantidade deve ser um número maior que zero');
  }

  if (dados.precoUnit !== undefined && (isNaN(dados.precoUnit) || dados.precoUnit < 0)) {
    errors.push('Preço unitário deve ser um número não negativo');
  }

  return errors;
}

/**
 * Função para verificar disponibilidade do produto
 */
async function verificarDisponibilidadeProduto(produtoId, quantidade, itemId = null) {
  const produto = await prisma.produto.findUnique({
    where: { id: parseInt(produtoId) }
  });

  if (!produto) {
    return { disponivel: false, erro: 'Produto não encontrado' };
  }

  if (produto.status !== 'Ativo') {
    return { disponivel: false, erro: 'Produto não está ativo' };
  }

  // Se for update, calcular a diferença de quantidade
  let quantidadeNecessaria = parseInt(quantidade);
  if (itemId) {
    const itemAtual = await prisma.itemVenda.findUnique({
      where: { id: itemId }
    });
    if (itemAtual) {
      quantidadeNecessaria -= itemAtual.quantidade;
    }
  }

  if (produto.estoque < quantidadeNecessaria) {
    return { 
      disponivel: false, 
      erro: `Estoque insuficiente. Disponível: ${produto.estoque}, Solicitado: ${quantidadeNecessaria}` 
    };
  }

  return { 
    disponivel: true, 
    produto: produto,
    quantidadeNecessaria: quantidadeNecessaria
  };
}

/**
 * Função para verificar se a venda pode ser modificada
 */
async function verificarVendaModificavel(vendaId) {
  const venda = await prisma.venda.findUnique({
    where: { id: parseInt(vendaId) },
    select: {
      status: true,
      data: true
    }
  });

  if (!venda) {
    return { modificavel: false, erro: 'Venda não encontrada' };
  }

  if (venda.status === 'Concluida') {
    return { modificavel: false, erro: 'Não é possível modificar itens de venda concluída' };
  }

  if (venda.status === 'Cancelada') {
    return { modificavel: false, erro: 'Não é possível modificar itens de venda cancelada' };
  }

  return { modificavel: true, venda: venda };
}

/**
 * Função para calcular total do item
 */
function calcularTotalItem(quantidade, precoUnit) {
  return parseFloat(quantidade) * parseFloat(precoUnit);
}

/**
 * Função para atualizar total da venda
 */
async function atualizarTotalVenda(vendaId) {
  const itens = await prisma.itemVenda.findMany({
    where: { vendaId: parseInt(vendaId) },
    select: {
      quantidade: true,
      precoUnit: true
    }
  });

  const totalVenda = itens.reduce((total, item) => {
    return total + (item.quantidade * item.precoUnit);
  }, 0);

  await prisma.venda.update({
    where: { id: parseInt(vendaId) },
    data: { total: totalVenda }
  });

  return totalVenda;
}

// Criar item de venda
const create = async (req, res) => {
  try {
    const { vendaId, produtoId, quantidade, precoUnit } = req.body;

    // Validar dados
    const errors = validarItemVenda(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ 
        erro: 'Dados inválidos',
        detalhes: errors 
      });
    }

    // Verificar se venda pode ser modificada
    const vendaStatus = await verificarVendaModificavel(vendaId);
    if (!vendaStatus.modificavel) {
      return res.status(400).json({ erro: vendaStatus.erro });
    }

    // Verificar disponibilidade do produto
    const disponibilidade = await verificarDisponibilidadeProduto(produtoId, quantidade);
    if (!disponibilidade.disponivel) {
      return res.status(400).json({ erro: disponibilidade.erro });
    }

    // Usar preço do produto se não informado
    const precoFinal = precoUnit || disponibilidade.produto.preco;

    // Criar item de venda em transação
    const itemVenda = await prisma.$transaction(async (tx) => {
      // Criar o item
      const novoItem = await tx.itemVenda.create({
        data: {
          vendaId: parseInt(vendaId),
          produtoId: parseInt(produtoId),
          quantidade: parseInt(quantidade),
          precoUnit: parseFloat(precoFinal)
        },
        include: {
          produto: {
            select: {
              id: true,
              nome: true,
              preco: true
            }
          },
          venda: {
            select: {
              id: true,
              data: true,
              status: true,
              cliente: {
                select: {
                  id: true,
                  nome: true
                }
              }
            }
          }
        }
      });

      // Atualizar total da venda
      await atualizarTotalVenda(vendaId);

      return novoItem;
    });

    res.status(201).json({
      message: 'Item de venda criado com sucesso',
      item: itemVenda,
      totalItem: calcularTotalItem(itemVenda.quantidade, itemVenda.precoUnit)
    });

  } catch (err) {
    console.error('Erro ao criar item de venda:', err);
    
    if (err.code === 'P2003') {
      return res.status(400).json({ 
        erro: 'Venda ou produto não encontrado' 
      });
    }
    
    res.status(400).json({ 
      erro: 'Erro ao criar item de venda.', 
      detalhes: err.message 
    });
  }
};

// Listar todos os itens de venda com paginação
const findAll = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20,
      vendaId,
      produtoId
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Construir where clause
    const where = {};
    
    if (vendaId && !isNaN(vendaId)) {
      where.vendaId = parseInt(vendaId);
    }
    
    if (produtoId && !isNaN(produtoId)) {
      where.produtoId = parseInt(produtoId);
    }

    const [itensVenda, total] = await Promise.all([
      prisma.itemVenda.findMany({
        where,
        skip,
        take: parseInt(limit),
        include: {
          produto: {
            select: {
              id: true,
              nome: true,
              preco: true
            }
          },
          venda: {
            select: {
              id: true,
              data: true,
              status: true,
              cliente: {
                select: {
                  id: true,
                  nome: true
                }
              }
            }
          }
        },
        orderBy: {
          id: 'desc'
        }
      }),
      prisma.itemVenda.count({ where })
    ]);

    // Calcular totais
    const itensComTotal = itensVenda.map(item => ({
      ...item,
      total: calcularTotalItem(item.quantidade, item.precoUnit)
    }));

    const totalGeral = itensComTotal.reduce((sum, item) => sum + item.total, 0);

    res.json({
      itens: itensComTotal,
      totais: {
        quantidadeItens: itensComTotal.length,
        valorTotal: totalGeral
      },
      paginacao: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (err) {
    console.error('Erro ao buscar itens de venda:', err);
    res.status(500).json({ 
      erro: 'Erro ao buscar itens de venda.', 
      detalhes: err.message 
    });
  }
};

// Buscar item de venda por ID
const findOne = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido.' });

  try {
    const itemVenda = await prisma.itemVenda.findUnique({
      where: { id },
      include: {
        produto: {
          select: {
            id: true,
            nome: true,
            descricao: true,
            preco: true,
            estoque: true,
            tipo: true,
            status: true
          }
        },
        venda: {
          include: {
            cliente: {
              select: {
                id: true,
                nome: true,
                email: true,
                telefone: true
              }
            },
            usuario: {
              select: {
                id: true,
                nome: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!itemVenda) {
      return res.status(404).json({ erro: 'Item de venda não encontrado.' });
    }

    const itemComTotal = {
      ...itemVenda,
      total: calcularTotalItem(itemVenda.quantidade, itemVenda.precoUnit)
    };

    res.json(itemComTotal);

  } catch (err) {
    console.error('Erro ao buscar item de venda:', err);
    res.status(500).json({ 
      erro: 'Erro ao buscar item de venda.', 
      detalhes: err.message 
    });
  }
};

// Atualizar item de venda
const update = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido.' });

  try {
    const { quantidade, precoUnit, produtoId } = req.body;

    // Validar dados (modo update)
    const errors = validarItemVenda(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({ 
        erro: 'Dados inválidos',
        detalhes: errors 
      });
    }

    // Buscar item atual
    const itemAtual = await prisma.itemVenda.findUnique({
      where: { id },
      include: {
        venda: {
          select: {
            id: true,
            status: true
          }
        }
      }
    });

    if (!itemAtual) {
      return res.status(404).json({ erro: 'Item de venda não encontrado.' });
    }

    // Verificar se venda pode ser modificada
    const vendaStatus = await verificarVendaModificavel(itemAtual.venda.id);
    if (!vendaStatus.modificavel) {
      return res.status(400).json({ erro: vendaStatus.erro });
    }

    // Se mudou o produto ou quantidade, verificar disponibilidade
    if (produtoId || quantidade) {
      const produtoAlvo = produtoId || itemAtual.produtoId;
      const quantidadeAlvo = quantidade || itemAtual.quantidade;
      
      const disponibilidade = await verificarDisponibilidadeProduto(
        produtoAlvo, 
        quantidadeAlvo, 
        id
      );
      
      if (!disponibilidade.disponivel) {
        return res.status(400).json({ erro: disponibilidade.erro });
      }
    }

    // Atualizar item de venda em transação
    const itemVenda = await prisma.$transaction(async (tx) => {
      const dadosAtualizacao = {};
      
      if (quantidade) dadosAtualizacao.quantidade = parseInt(quantidade);
      if (precoUnit) dadosAtualizacao.precoUnit = parseFloat(precoUnit);
      if (produtoId) dadosAtualizacao.produtoId = parseInt(produtoId);

      const itemAtualizado = await tx.itemVenda.update({
        where: { id },
        data: dadosAtualizacao,
        include: {
          produto: {
            select: {
              id: true,
              nome: true
            }
          },
          venda: {
            select: {
              id: true,
              status: true
            }
          }
        }
      });

      // Atualizar total da venda
      await atualizarTotalVenda(itemAtualizado.venda.id);

      return itemAtualizado;
    });

    res.json({
      message: 'Item de venda atualizado com sucesso',
      item: itemVenda,
      totalItem: calcularTotalItem(itemVenda.quantidade, itemVenda.precoUnit)
    });

  } catch (err) {
    console.error('Erro ao atualizar item de venda:', err);
    
    if (err.code === 'P2025') {
      return res.status(404).json({ erro: 'Item de venda não encontrado.' });
    }
    
    res.status(400).json({ 
      erro: 'Erro ao atualizar item de venda.', 
      detalhes: err.message 
    });
  }
};

// Deletar item de venda
const remove = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido.' });

  try {
    // Buscar item para obter vendaId
    const item = await prisma.itemVenda.findUnique({
      where: { id },
      include: {
        venda: {
          select: {
            id: true,
            status: true
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ erro: 'Item de venda não encontrado.' });
    }

    // Verificar se venda pode ser modificada
    const vendaStatus = await verificarVendaModificavel(item.venda.id);
    if (!vendaStatus.modificavel) {
      return res.status(400).json({ erro: vendaStatus.erro });
    }

    await prisma.$transaction(async (tx) => {
      // Deletar item
      await tx.itemVenda.delete({ where: { id } });

      // Atualizar total da venda
      await atualizarTotalVenda(item.venda.id);
    });

    res.json({ 
      mensagem: 'Item de venda deletado com sucesso.',
      vendaId: item.venda.id
    });

  } catch (err) {
    console.error('Erro ao deletar item de venda:', err);
    
    if (err.code === 'P2025') {
      return res.status(404).json({ erro: 'Item de venda não encontrado.' });
    }
    
    res.status(400).json({ 
      erro: 'Erro ao deletar item de venda.', 
      detalhes: err.message 
    });
  }
};

// Buscar itens por venda
const findByVenda = async (req, res) => {
  const vendaId = parseInt(req.params.vendaId);
  if (isNaN(vendaId)) return res.status(400).json({ erro: 'ID da venda inválido.' });

  try {
    const itensVenda = await prisma.itemVenda.findMany({
      where: { vendaId },
      include: {
        produto: {
          select: {
            id: true,
            nome: true,
            descricao: true,
            preco: true
          }
        }
      },
      orderBy: {
        id: 'asc'
      }
    });

    const itensComTotal = itensVenda.map(item => ({
      ...item,
      total: calcularTotalItem(item.quantidade, item.precoUnit)
    }));

    const totalVenda = itensComTotal.reduce((sum, item) => sum + item.total, 0);

    res.json({
      vendaId: vendaId,
      itens: itensComTotal,
      totais: {
        quantidadeItens: itensComTotal.length,
        valorTotal: totalVenda
      }
    });

  } catch (err) {
    console.error('Erro ao buscar itens da venda:', err);
    res.status(500).json({ 
      erro: 'Erro ao buscar itens da venda.', 
      detalhes: err.message 
    });
  }
};

module.exports = {
  create,
  findAll,
  findOne,
  update,
  remove,
  findByVenda
};