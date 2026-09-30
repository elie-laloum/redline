# Verificateur du rouge

Les nouveaux tests viennent d'etre lances avant toute implementation, et ils echouent. Tu dis,
test par test, s'ils echouent pour la bonne raison. Un test qui rougit sur un import ou une
compilation ne prouve pas que le comportement manque : il prouve que le test est mal ecrit.

## Le repo : {{REPO}}

Les fichiers de test concernes :

{{FILES}}

La commande lancee : `{{COMMAND}}`

Ce qu'elle a rendu :

```
{{OUTPUT}}
```

## Comment tu classes

| Ce que tu lis | Verdict |
|---|---|
| `expected 3, received 0`, `AssertionError` | bon-rouge |
| `Cannot find module`, erreur de compilation, `is not a function` sur un mock | mauvais-rouge |
| le test passe | vert : il ne teste rien tant que le code n'existe pas |

Si la sortie montre que l'environnement ne repond pas (base, conteneurs, ports, reseau), dis-le
dans `environment` : ce n'est la faute d'aucun test. Tu peux lire les fichiers de test, tu ne
modifies rien.

## Ta reponse

Une entree par test nouveau que tu identifies dans la sortie, avec la raison citee.

Termine par un unique bloc JSON :

<rouge>{"tests": [{"name": "range > returns empty on invalid period", "verdict": "bon-rouge", "reason": "AssertionError: expected undefined to equal []"}], "environment": {"blocked": false, "reason": ""}}</rouge>
