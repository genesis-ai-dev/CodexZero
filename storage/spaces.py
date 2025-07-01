import boto3
from typing import BinaryIO

class DigitalOceanSpaces:
    """DigitalOcean Spaces storage (S3-compatible)"""
    
    def __init__(self, region: str, endpoint_url: str, access_key: str, secret_key: str, bucket_name: str):
        self.bucket_name = bucket_name
        self.endpoint_url = endpoint_url
        self.region = region
        
        self.client = boto3.client(
            's3',
            region_name=region,
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key
        )
    
    def store_file(self, file_data: BinaryIO, file_path: str) -> str:
        """Store a file and return its public URL"""
        self.client.upload_fileobj(
            file_data,
            self.bucket_name,
            file_path,
            ExtraArgs={'ACL': 'public-read'}
        )
        return self.get_file_url(file_path)
    
    def get_file(self, file_path: str) -> bytes:
        """Retrieve file contents"""
        response = self.client.get_object(Bucket=self.bucket_name, Key=file_path)
        return response['Body'].read()
    
    def delete_file(self, file_path: str) -> None:
        """Delete a file"""
        self.client.delete_object(Bucket=self.bucket_name, Key=file_path)
    
    def get_file_url(self, file_path: str) -> str:
        """Get public URL for a file"""
        return f"{self.endpoint_url}/{self.bucket_name}/{file_path}"
    
    def file_exists(self, file_path: str) -> bool:
        """Check if file exists"""
        response = self.client.list_objects_v2(
            Bucket=self.bucket_name,
            Prefix=file_path,
            MaxKeys=1
        )
        return 'Contents' in response and len(response['Contents']) > 0 