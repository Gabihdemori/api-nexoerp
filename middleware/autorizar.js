function autorizar(perfisPermitidos) {
  return (req, res, next) => {
    const perfilUsuario = req.user.perfil;
    if (!perfisPermitidos.includes(perfilUsuario)) {
      return res.status(403).json({ error: 'Você não tem permissão para acessar isso.' });
    }
    next();
  };
}
module.exports = autorizar;