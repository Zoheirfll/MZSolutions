def parse_pagination(request, default_per_page=10, max_per_page=100):
    """Parsing sûr de `page`/`per_page` (Sécurité — point 8) : la plupart des
    endpoints paginés faisaient `int(request.query_params.get(...))` sans
    try/except (un `per_page=abc` provoquait un 500 non géré) ni plafond haut
    (un `per_page` énorme n'était borné que sur un seul endpoint)."""
    def _parse(name, default):
        try:
            return int(request.query_params.get(name, default))
        except (TypeError, ValueError):
            return default

    page = max(1, _parse('page', 1))
    per_page = max(1, min(max_per_page, _parse('per_page', default_per_page)))
    return page, per_page
