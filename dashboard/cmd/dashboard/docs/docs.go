package docs

import "github.com/swaggo/swag"

var SwaggerInfo = &swag.Spec{
	Version: "1.0",
}

func init() {
	swag.Register(SwaggerInfo.InstanceName(), SwaggerInfo)
}
